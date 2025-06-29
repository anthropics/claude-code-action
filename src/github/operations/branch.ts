#!/usr/bin/env bun

/**
 * Setup the appropriate branch based on the event type:
 * - For PRs: Checkout the PR branch
 * - For Issues: Create a new branch
 */

import { $ } from "bun";
import * as core from "@actions/core";
import type { ParsedGitHubContext } from "../context";
import type { GitHubPullRequest, GitHubIssue } from "../types";
import type { Octokits } from "../api/client";
import type { FetchDataResult } from "../data/fetcher";
import { generatePRContent } from "./pr-generator";

export type BranchInfo = {
  baseBranch: string;
  claudeBranch?: string;
  currentBranch: string;
  prUrl?: string;
};

export async function setupBranch(
  octokits: Octokits,
  githubData: FetchDataResult,
  context: ParsedGitHubContext,
): Promise<BranchInfo> {
  const { owner, repo } = context.repository;
  const entityNumber = context.entityNumber;
  const { baseBranch, branchPrefix } = context.inputs;
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

      // Determine optimal fetch depth based on PR commit count, with a minimum of 20
      const commitCount = prData.commits.totalCount;
      const fetchDepth = Math.max(commitCount, 20);

      console.log(
        `PR #${entityNumber}: ${commitCount} commits, using fetch depth ${fetchDepth}`,
      );

      // Execute git commands to checkout PR branch (dynamic depth based on PR size)
      await $`git fetch origin --depth=${fetchDepth} ${branchName}`;
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
  console.log(
    `Creating new branch for ${entityType} #${entityNumber} from source branch: ${sourceBranch}...`,
  );

  const timestamp = new Date()
    .toISOString()
    .replace(/[:-]/g, "")
    .replace(/\.\d{3}Z/, "")
    .split("T")
    .join("_");

  const newBranch = `${branchPrefix}${entityType}-${entityNumber}-${timestamp}`;

  try {
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
      ref: `refs/heads/${newBranch}`,
      sha: currentSHA,
    });

    // Checkout the new branch (shallow fetch for performance)
    await $`git fetch origin --depth=1 ${newBranch}`;
    await $`git checkout ${newBranch}`;

    console.log(
      `Successfully created and checked out new branch: ${newBranch}`,
    );

    // Set outputs for GitHub Actions
    core.setOutput("CLAUDE_BRANCH", newBranch);
    core.setOutput("BASE_BRANCH", sourceBranch);

    // Create PR automatically if the option is enabled and this is an issue
    let prUrl: string | undefined;
    if (!isPR && context.inputs.autoCreatePr) {
      console.log("Creating pull request automatically...");
      try {
        const issueData = githubData.contextData as GitHubIssue;
        const { title, body } = generatePRContent(
          issueData,
          entityNumber.toString(),
        );
        console.log(`Creating PR with title: "${title}"`);

        const prResponse = await octokits.rest.pulls.create({
          owner,
          repo,
          title,
          head: newBranch,
          base: sourceBranch,
          body,
          draft: false,
        });

        prUrl = prResponse.data.html_url;
        console.log(`Successfully created PR: ${prUrl}`);
        core.setOutput("PR_URL", prUrl);
      } catch (error) {
        console.error("Error creating pull request:", error);
        // Don't fail the action if PR creation fails
      }
    }

    return {
      baseBranch: sourceBranch,
      claudeBranch: newBranch,
      currentBranch: newBranch,
      prUrl,
    };
  } catch (error) {
    console.error("Error creating branch:", error);
    process.exit(1);
  }
}
