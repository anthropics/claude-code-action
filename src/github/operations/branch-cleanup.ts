import type { Octokits } from "../api/client";
import { GITHUB_SERVER_URL } from "../api/config";
import { $ } from "bun";

export async function checkAndCommitOrDeleteBranch(
  octokit: Octokits,
  owner: string,
  repo: string,
  claudeBranch: string | undefined,
  baseBranch: string,
  useCommitSigning: boolean,
): Promise<{ shouldDeleteBranch: boolean; branchLink: string }> {
  let branchLink = "";
  let shouldDeleteBranch = false;

  if (claudeBranch) {
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
            const gitStatus = await $`git status --porcelain`.quiet();
            const hasUncommittedChanges =
              gitStatus.stdout.toString().trim().length > 0;

            if (hasUncommittedChanges) {
              console.log("Found uncommitted changes, committing them...");

              // Add all changes
              await $`git add -A`;

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
              const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${claudeBranch}`;
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
            const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${claudeBranch}`;
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
        const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${claudeBranch}`;
        branchLink = `\n[View branch](${branchUrl})`;
      }
    } catch (error) {
      console.error("Error checking for commits on Claude branch:", error);
      // If we can't check, assume the branch has commits to be safe
      const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${claudeBranch}`;
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
