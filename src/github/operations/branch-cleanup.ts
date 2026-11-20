import type { Octokits } from "../api/client";
import { GITHUB_SERVER_URL } from "../api/config";
import { createBranchLink, encodeBranchNameForUrl } from "./comments/common";
import { $ } from "bun";

async function pushLfsObjects(
  ref: string,
  includeDeleted = false,
): Promise<void> {
  const historyArgs = includeDeleted ? ["--deleted", ref] : [];
  let tracked: string;
  try {
    tracked = await $`git lfs ls-files --name-only ${historyArgs}`
      .quiet()
      .text();
  } catch (error) {
    if (
      includeDeleted &&
      (await $`git lfs version`.quiet().nothrow()).exitCode === 0
    ) {
      throw error;
    }
    return; // Git LFS isn't installed here
  }
  if (!tracked.trim()) return;

  if (includeDeleted) {
    // Git LFS reads a working-tree .lfsconfig before the one in the commit.
    // Only replay with the endpoint configuration that belongs to this commit.
    const configChanges =
      await $`git status --porcelain --untracked-files=all --ignored=matching -- ${":(top,literal).lfsconfig"}`
        .quiet()
        .text();
    if (configChanges.trim()) {
      throw new UnpublishedBranchRecoveryError(
        "The working-tree LFS configuration differs from the recorded commit. Local changes were retained.",
      );
    }
  }
  await $`git lfs push origin ${ref}`.quiet();
}

export type BranchPushRecovery = {
  baseSha: string;
  commitSha: string;
  expectedPushUrl?: string;
};

export class UnpublishedBranchRecoveryError extends Error {}

function isCommitSha(value: string | undefined): value is string {
  return value !== undefined && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value);
}

async function recoverRecordedPush(
  branch: string,
  baseBranch: string,
  { baseSha, commitSha, expectedPushUrl }: BranchPushRecovery,
  remoteSha: string | undefined,
  restoredConfigPaths: string[],
): Promise<boolean> {
  try {
    if (
      branch === baseBranch ||
      !isCommitSha(baseSha) ||
      !isCommitSha(commitSha)
    ) {
      throw new UnpublishedBranchRecoveryError(
        "The recorded push does not identify a valid action-created branch and commit.",
      );
    }
    const ref = `refs/heads/${branch}`;
    await $`git check-ref-format ${ref}`.quiet();
    const currentRef = await $`git symbolic-ref --quiet HEAD`.quiet().nothrow();
    if (currentRef.text().trim() !== ref) {
      throw new UnpublishedBranchRecoveryError(
        "The checked-out branch no longer matches the recorded push. Local changes were retained.",
      );
    }
    const currentCommit = (
      await $`git rev-parse --verify HEAD^{commit}`.quiet().text()
    ).trim();
    if (currentCommit !== commitSha) {
      throw new UnpublishedBranchRecoveryError(
        "The checked-out branch no longer points to the recorded commit. Local changes were retained.",
      );
    }

    const ancestor =
      await $`git merge-base --is-ancestor ${baseSha} ${commitSha}`
        .quiet()
        .nothrow();
    if (ancestor.exitCode !== 0) {
      throw new UnpublishedBranchRecoveryError(
        "The recorded commit does not descend from the branch's starting commit. Local changes were retained.",
      );
    }
    const diff =
      await $`git diff --quiet --no-ext-diff --no-textconv ${baseSha} ${commitSha} --`
        .quiet()
        .nothrow();
    if (diff.exitCode !== 0 && diff.exitCode !== 1) {
      throw new UnpublishedBranchRecoveryError(
        "Could not verify the recorded commit's changes. Local changes were retained.",
      );
    }
    const status = await $`git status --porcelain --untracked-files=normal`
      .quiet()
      .nothrow();
    if (status.exitCode === 0 && status.text().trim()) {
      console.warn(
        "The recorded push does not include uncommitted changes. They remain in the working tree.",
      );
    }
    if (diff.exitCode === 0) return false;

    if (restoredConfigPaths.length > 0) {
      const restoredPathspecs = restoredConfigPaths.map((path) =>
        path === "package.json"
          ? ":(top,glob)**/package.json"
          : `:(top,literal)${path}`,
      );
      const restoredChanges =
        await $`git log --full-history --format=%H ${`${baseSha}..${commitSha}`} -- ${restoredPathspecs}`
          .quiet()
          .text();
      if (restoredChanges.trim()) {
        throw new UnpublishedBranchRecoveryError(
          "The recorded commits include restored configuration. Local changes were retained.",
        );
      }
    }

    if (remoteSha !== commitSha) {
      if (remoteSha) {
        const canFastForward =
          await $`git merge-base --is-ancestor ${remoteSha} ${commitSha}`
            .quiet()
            .nothrow();
        if (canFastForward.exitCode !== 0) {
          throw new UnpublishedBranchRecoveryError(
            "The remote branch cannot fast-forward to the recorded commit. Local changes were retained.",
          );
        }
      }

      if (expectedPushUrl !== undefined) {
        const currentPushUrl = (
          await $`git remote get-url --push --all origin`.quiet().text()
        ).trim();
        if (
          !expectedPushUrl ||
          /[\r\n]/.test(expectedPushUrl) ||
          currentPushUrl !== expectedPushUrl
        ) {
          throw new UnpublishedBranchRecoveryError(
            "The Git push destination no longer matches the recorded push. Local changes were retained.",
          );
        }
      }
      await pushLfsObjects(commitSha, true);

      // An empty expected value means the ref must still be absent. An existing
      // ref must still match the SHA already checked for fast-forward above.
      const lease = `--force-with-lease=${ref}:${remoteSha ?? ""}`;
      const refspec = `${commitSha}:${ref}`;
      await $`git push --no-follow-tags --recurse-submodules=no ${lease} origin ${refspec}`.quiet();
      console.log(`Published the recorded Git push for ${branch}`);
    }

    return true;
  } catch (error) {
    if (error instanceof UnpublishedBranchRecoveryError) throw error;
    throw new UnpublishedBranchRecoveryError(
      "Git could not publish the recorded push. Local changes were retained.",
    );
  }
}

export async function checkAndCommitOrDeleteBranch(
  octokit: Octokits,
  owner: string,
  repo: string,
  claudeBranch: string | undefined,
  baseBranch: string,
  useCommitSigning: boolean,
  restoredConfigPaths: string[] = [],
  options: { recovery?: BranchPushRecovery } = {},
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
    const recovery = useCommitSigning ? undefined : options.recovery;
    // First check if the branch exists remotely
    let branchExistsRemotely = false;
    let remoteSha: string | undefined;
    try {
      const { data } = await octokit.rest.repos.getBranch({
        owner,
        repo,
        branch: claudeBranch,
      });
      branchExistsRemotely = true;
      if (recovery) remoteSha = data?.commit?.sha;
    } catch (error: any) {
      if (error.status === 404) {
        console.log(`Branch ${claudeBranch} does not exist remotely`);
      } else {
        if (recovery) {
          throw new UnpublishedBranchRecoveryError(
            "Could not confirm the remote branch state for the recorded push. Local changes were retained.",
          );
        }
        console.error("Error checking if branch exists:", error);
      }
    }

    if (recovery) {
      if (branchExistsRemotely && !isCommitSha(remoteSha)) {
        throw new UnpublishedBranchRecoveryError(
          "Could not confirm the remote branch commit for the recorded push. Local changes were retained.",
        );
      }
      const published = await recoverRecordedPush(
        claudeBranch,
        baseBranch,
        recovery,
        remoteSha,
        restoredConfigPaths,
      );
      return {
        shouldDeleteBranch: false,
        branchLink: published
          ? createBranchLink(owner, repo, claudeBranch)
          : "",
      };
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

              // Hooks are off by now, and Git LFS uploads from a hook.
              await pushLfsObjects(claudeBranch);

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
