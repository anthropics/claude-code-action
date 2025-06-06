#!/usr/bin/env bun

/**
 * Setup the appropriate branch based on the event type:
 * - For PRs: Checkout the PR branch
 * - For Issues: Create a new branch
 */

import { $ } from "bun";
import * as core from "@actions/core";
import type { ParsedGitHubContext } from "../context";
import type { GitHubPullRequest } from "../types";
import type { Octokits } from "../api/client";
import type { FetchDataResult } from "../data/fetcher";

export type BranchInfo = {
  baseBranch: string;
  claudeBranch?: string;
  currentBranch: string;
  isReusedBranch?: boolean;
};

export async function setupBranch(
  octokits: Octokits,
  githubData: FetchDataResult,
  context: ParsedGitHubContext,
): Promise<BranchInfo> {
  const { owner, repo } = context.repository;
  const entityNumber = context.entityNumber;
  const { baseBranch } = context.inputs;
  const isPR = context.isPR;

  if (isPR) {
    const prData = githubData.contextData as GitHubPullRequest;
    const prState = prData.state;

    // Check if PR is closed or merged
    if (prState === "CLOSED" || prState === "MERGED") {
      console.log(
        `PR #${entityNumber} is ${prState}, creating new branch from source...`,
      );
      // Fall through to create a new branch like we do for issues
    } else {
      // Handle open PR: Checkout the PR branch
      console.log("This is an open PR, checking out PR branch...");

      const branchName = prData.headRefName;

      // Execute git commands to checkout PR branch (shallow fetch for performance)
      // Fetch the branch with a depth of 20 to avoid fetching too much history, while still allowing for some context
      await $`git fetch origin --depth=20 ${branchName}`;
      await $`git checkout ${branchName}`;

      console.log(`Successfully checked out PR branch for PR #${entityNumber}`);

      // For open PRs, we need to get the base branch of the PR
      const baseBranch = prData.baseRefName;

      return {
        baseBranch,
        currentBranch: branchName,
      };
    }
  }

  // Determine source branch - use baseBranch if provided, otherwise fetch default
  let sourceBranch: string;

  if (baseBranch) {
    // Use provided base branch for source
    sourceBranch = baseBranch;
  } else {
    // No base branch provided, fetch the default branch to use as source
    const repoResponse = await octokits.rest.repos.get({
      owner,
      repo,
    });
    sourceBranch = repoResponse.data.default_branch;
  }

  // Creating a new branch for either an issue or closed/merged PR
  const entityType = isPR ? "pr" : "issue";
  
  // For issues, check if a Claude branch already exists
  let branchToUse: string | null = null;
  let isReusedBranch = false;
  
  if (!isPR) {
    // Check for existing Claude branches for this issue
    try {
      // Use GraphQL to efficiently search for branches with a specific prefix
      const query = `
        query($owner: String!, $repo: String!, $prefix: String!) {
          repository(owner: $owner, name: $repo) {
            refs(refPrefix: "refs/heads/", query: $prefix, first: 100) {
              nodes {
                name
              }
            }
          }
        }
      `;
      
      const response = await octokits.graphql<{
        repository: {
          refs: {
            nodes: Array<{ name: string }>;
          };
        };
      }>(query, {
        owner,
        repo,
        prefix: `claude/issue-${entityNumber}-`,
      });
      
      const branches = response.repository.refs.nodes;
      
      if (branches.length > 0) {
        // Use the first matching branch (could be sorted by date in future)
        branchToUse = branches[0].name;
        isReusedBranch = true;
        console.log(`Found existing Claude branch for issue #${entityNumber}: ${branchToUse}`);
      }
    } catch (error) {
      console.error("Error checking for existing branches:", error);
      // Continue with new branch creation if check fails
    }
  }
  
  // If no existing branch found or this is a PR, create a new branch
  if (!branchToUse) {
    console.log(
      `Creating new branch for ${entityType} #${entityNumber} from source branch: ${sourceBranch}...`,
    );

    const timestamp = new Date()
      .toISOString()
      .replace(/[:-]/g, "")
      .replace(/\.\d{3}Z/, "")
      .split("T")
      .join("_");

    branchToUse = `claude/${entityType}-${entityNumber}-${timestamp}`;
  }

  try {
    if (isReusedBranch) {
      // For existing branches, just checkout
      console.log(`Checking out existing branch: ${branchToUse}`);
      
      // Fetch the branch with more depth to allow for context
      await $`git fetch origin --depth=20 ${branchToUse}`;
      await $`git checkout ${branchToUse}`;
      
      console.log(
        `Successfully checked out existing branch: ${branchToUse}`,
      );
      console.log(
        `Note: This is a reused branch from a previous Claude invocation on issue #${entityNumber}`,
      );
    } else {
      // Get the SHA of the source branch
      const sourceBranchRef = await octokits.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${sourceBranch}`,
      });

      const currentSHA = sourceBranchRef.data.object.sha;

      console.log(`Current SHA: ${currentSHA}`);

      // Create branch using GitHub API
      await octokits.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchToUse}`,
        sha: currentSHA,
      });

      // Checkout the new branch (shallow fetch for performance)
      await $`git fetch origin --depth=1 ${branchToUse}`;
      await $`git checkout ${branchToUse}`;

      console.log(
        `Successfully created and checked out new branch: ${branchToUse}`,
      );
    }

    // Set outputs for GitHub Actions
    core.setOutput("CLAUDE_BRANCH", branchToUse);
    core.setOutput("BASE_BRANCH", sourceBranch);
    if (isReusedBranch) {
      core.setOutput("IS_REUSED_BRANCH", "true");
    }
    return {
      baseBranch: sourceBranch,
      claudeBranch: branchToUse,
      currentBranch: branchToUse,
      isReusedBranch,
    };
  } catch (error) {
    console.error("Error setting up branch:", error);
    process.exit(1);
  }
}
