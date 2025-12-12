#!/usr/bin/env bun

/**
 * Setup the appropriate branch based on the event type:
 * - For PRs: Checkout the PR branch
 * - For Issues: Create a new branch
 */

import { execFileSync } from "child_process";
import * as core from "@actions/core";
import type { ParsedGitHubContext } from "../context";
import type { GitHubPullRequest } from "../types";
import type { Octokits } from "../api/client";
import type { FetchDataResult } from "../data/fetcher";

/**
 * Validates a git branch name against a strict whitelist pattern.
 * This prevents command injection by ensuring only safe characters are used.
 *
 * Valid branch names:
 * - Start with alphanumeric character
 * - Contain only alphanumeric, forward slash, hyphen, underscore, or period
 * - Do not contain '..' (path traversal)
 * - Do not end with '.lock'
 * - Do not contain '@{'
 */
function validateBranchName(branchName: string): void {
  // Check for empty or whitespace-only names
  if (!branchName || branchName.trim().length === 0) {
    throw new Error("Branch name cannot be empty");
  }

  // Strict whitelist pattern: alphanumeric start, then alphanumeric/slash/hyphen/underscore/period
  const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/;

  if (!validPattern.test(branchName)) {
    throw new Error(
      `Invalid branch name: "${branchName}". Branch names must start with an alphanumeric character and contain only alphanumeric characters, forward slashes, hyphens, underscores, or periods.`,
    );
  }

  // Additional git-specific validations
  if (branchName.includes("..")) {
    throw new Error(
      `Invalid branch name: "${branchName}". Branch names cannot contain '..'`,
    );
  }

  if (branchName.endsWith(".lock")) {
    throw new Error(
      `Invalid branch name: "${branchName}". Branch names cannot end with '.lock'`,
    );
  }

  if (branchName.includes("@{")) {
    throw new Error(
      `Invalid branch name: "${branchName}". Branch names cannot contain '@{'`,
    );
  }
}

/**
 * Executes a git command safely using execFileSync to avoid shell interpolation.
 */
function execGit(args: string[]): void {
  execFileSync("git", args, { stdio: "inherit" });
}

export type BranchInfo = {
  baseBranch: string;
  claudeBranch?: string;
  currentBranch: string;
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

      // Validate branch names before use to prevent command injection
      validateBranchName(branchName);

      // Execute git commands to checkout PR branch (dynamic depth based on PR size)
      // Using execFileSync instead of shell template literals for security
      execGit(["fetch", "origin", `--depth=${fetchDepth}`, branchName]);
      execGit(["checkout", branchName, "--"]);

      console.log(`Successfully checked out PR branch for PR #${entityNumber}`);

      // For open PRs, we need to get the base branch of the PR
      const baseBranch = prData.baseRefName;
      validateBranchName(baseBranch);

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

  // Generate branch name for either an issue or closed/merged PR
  const entityType = isPR ? "pr" : "issue";

  // Create Kubernetes-compatible timestamp: lowercase, hyphens only, shorter format
  const now = new Date();
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

  // Ensure branch name is Kubernetes-compatible:
  // - Lowercase only
  // - Alphanumeric with hyphens
  // - No underscores
  // - Max 50 chars (to allow for prefixes)
  const branchName = `${branchPrefix}${entityType}-${entityNumber}-${timestamp}`;
  const newBranch = branchName.toLowerCase().substring(0, 50);

  try {
    // Get the SHA of the source branch to verify it exists
    const sourceBranchRef = await octokits.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${sourceBranch}`,
    });

    const currentSHA = sourceBranchRef.data.object.sha;
    console.log(`Source branch SHA: ${currentSHA}`);

    // For commit signing, defer branch creation to the file ops server
    if (context.inputs.useCommitSigning) {
      console.log(
        `Branch name generated: ${newBranch} (will be created by file ops server on first commit)`,
      );

      // Ensure we're on the source branch
      console.log(`Fetching and checking out source branch: ${sourceBranch}`);
      validateBranchName(sourceBranch);
      execGit(["fetch", "origin", sourceBranch, "--depth=1"]);
      execGit(["checkout", sourceBranch]);

      // Set outputs for GitHub Actions
      core.setOutput("CLAUDE_BRANCH", newBranch);
      core.setOutput("BASE_BRANCH", sourceBranch);
      return {
        baseBranch: sourceBranch,
        claudeBranch: newBranch,
        currentBranch: sourceBranch, // Stay on source branch for now
      };
    }

    // For non-signing case, create and checkout the branch locally only
    console.log(
      `Creating local branch ${newBranch} for ${entityType} #${entityNumber} from source branch: ${sourceBranch}...`,
    );

    // Fetch and checkout the source branch first to ensure we branch from the correct base
    console.log(`Fetching and checking out source branch: ${sourceBranch}`);
    validateBranchName(sourceBranch);
    validateBranchName(newBranch);
    execGit(["fetch", "origin", sourceBranch, "--depth=1"]);
    execGit(["checkout", sourceBranch]);

    // Create and checkout the new branch from the source branch
    execGit(["checkout", "-b", newBranch]);

    console.log(
      `Successfully created and checked out local branch: ${newBranch}`,
    );

    // Set outputs for GitHub Actions
    core.setOutput("CLAUDE_BRANCH", newBranch);
    core.setOutput("BASE_BRANCH", sourceBranch);
    return {
      baseBranch: sourceBranch,
      claudeBranch: newBranch,
      currentBranch: newBranch,
    };
  } catch (error) {
    console.error("Error in branch setup:", error);
    process.exit(1);
  }
}
