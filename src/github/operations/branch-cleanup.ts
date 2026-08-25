import type { Octokits } from "../api/client";
import { GITHUB_SERVER_URL } from "../api/config";
import { encodeBranchNameForUrl } from "./comments/common";
import { $ } from "bun";

export async function checkAndCommitOrDeleteBranch(
  octokit: Octokits,
  owner: string,
  repo: string,
  claudeBranch: string | undefined,
  baseBranch: string,
  useCommitSigning: boolean,
  restoredConfigPaths: string[] = [],
): Promise<{ shouldDeleteBranch: boolean; branchLink: string }> {
  let branchLink = "";
  let shouldDeleteBranch = false;

  // On pull requests, restoreConfigFromBase replaces .claude/, CLAUDE.md and
  // friends with the base branch's versions and leaves them unstaged so the
  // revert does not reach a commit. Auto-committing with a bare `git add -A`
  // would stage them anyway and push a silent revert of the PR author's own
  // config onto their branch.
  //
  // The exclusion is driven by what was actually restored rather than applied
  // unconditionally: this path also runs for issues, where no restore happens
  // and Claude may legitimately have been asked to edit CLAUDE.md or
  // .claude/settings.json. Excluding those there would silently drop the work.
  const pathspecArgs =
    restoredConfigPaths.length > 0
      ? ["--", ".", ...restoredConfigPaths.map((p) => `:(exclude)${p}`)]
      : [];

  if (pathspecArgs.length > 0) {
    console.log(
      `Excluding base-restored config from auto-commit: ${restoredConfigPaths.join(", ")}`,
    );
  }

  if (claudeBranch) {
    // First check if the branch exists remotely
    let branchExistsRemotely = false;
    try {
      await octokit.rest.repos.getBranch({
        owner,
        repo,
        branch: claudeBranch,
      });
      branchExistsRemotely = true;
    } catch (error: any) {
      if (error.status === 404) {
        console.log(`Branch ${claudeBranch} does not exist remotely`);
      } else {
        console.error("Error checking if branch exists:", error);
      }
    }

    // Only proceed if branch exists remotely
    if (!branchExistsRemotely) {
      console.log(
        `Branch ${claudeBranch} does not exist remotely, no branch link will be added`,
      );
      return { shouldDeleteBranch: false, branchLink: "" };
    }

    // Check if Claude made any commits to the branch
    try {
      const { data: comparison } =
        await octokit.rest.repos.compareCommitsWithBasehead({
          owner,
          repo,
          basehead: `${baseBranch}...${claudeBranch}`,
        });

      // If there are no commits, check for uncommitted changes if not using commit signing
      if (comparison.total_commits === 0) {
        if (!useCommitSigning) {
          console.log(
            `Branch ${claudeBranch} has no commits from Claude, checking for uncommitted changes...`,
          );

          // Check for uncommitted changes using git status
          try {
            // Scoped the same way as the staging below: if the restored config
            // is the only dirty entry there is no real work, and the branch
            // should be treated as empty rather than receiving a pure revert.
            const gitStatus =
              await $`git status --porcelain ${pathspecArgs}`.quiet();
            const hasUncommittedChanges =
              gitStatus.stdout.toString().trim().length > 0;

            if (hasUncommittedChanges) {
              console.log("Found uncommitted changes, committing them...");

              // Add all changes, minus anything restored from the base branch
              await $`git add -A ${pathspecArgs}`;

              // Commit with a descriptive message
              const runId = process.env.GITHUB_RUN_ID || "unknown";
              const commitMessage = `Auto-commit: Save uncommitted changes from Claude\n\nRun ID: ${runId}`;
              await $`git commit -m ${commitMessage}`;

              // Push the changes
              await $`git push origin ${claudeBranch}`;

              console.log(
                "✅ Successfully committed and pushed uncommitted changes",
              );

              // Set branch link since we now have commits
              const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${encodeBranchNameForUrl(claudeBranch)}`;
              branchLink = `\n[View branch](${branchUrl})`;
            } else {
              console.log(
                "No uncommitted changes found, marking branch for deletion",
              );
              shouldDeleteBranch = true;
            }
          } catch (gitError) {
            console.error("Error checking/committing changes:", gitError);
            // If we can't check git status, assume the branch might have changes
            const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${encodeBranchNameForUrl(claudeBranch)}`;
            branchLink = `\n[View branch](${branchUrl})`;
          }
        } else {
          console.log(
            `Branch ${claudeBranch} has no commits from Claude, will delete it`,
          );
          shouldDeleteBranch = true;
        }
      } else {
        // Only add branch link if there are commits
        const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${encodeBranchNameForUrl(claudeBranch)}`;
        branchLink = `\n[View branch](${branchUrl})`;
      }
    } catch (error) {
      console.error("Error comparing commits on Claude branch:", error);
      // If we can't compare but the branch exists remotely, include the branch link
      const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${encodeBranchNameForUrl(claudeBranch)}`;
      branchLink = `\n[View branch](${branchUrl})`;
    }
  }

  // Delete the branch if it has no commits
  if (shouldDeleteBranch && claudeBranch) {
    try {
      await octokit.rest.git.deleteRef({
        owner,
        repo,
        ref: `heads/${claudeBranch}`,
      });
      console.log(`✅ Deleted empty branch: ${claudeBranch}`);
    } catch (deleteError) {
      console.error(`Failed to delete branch ${claudeBranch}:`, deleteError);
      // Continue even if deletion fails
    }
  }

  return { shouldDeleteBranch, branchLink };
}
