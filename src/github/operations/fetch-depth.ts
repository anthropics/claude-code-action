import { execFileSync, spawnSync } from "child_process";
import * as core from "@actions/core";
import type { Octokit } from "@octokit/rest";

/**
 * Builds the `--depth` argument for a `git fetch`, unless the checkout still
 * has its full history.
 *
 * `--depth` does not only cap what gets downloaded. Against a complete checkout
 * (`actions/checkout` with `fetch-depth: 0`) it also truncates the history that
 * is already there and marks the repository shallow, which drops the merge base
 * with the base branch: `git log origin/<base>..HEAD` then quietly lists
 * commits that are already merged, and `git diff origin/<base>...HEAD` fails
 * with "no merge base". Those are the commands the prompt tells Claude to run
 * to scope its work to the PR.
 *
 * A shallow checkout (the `fetch-depth: 1` default) has no history left to
 * lose, so the limit still applies there and large repositories keep the fetch
 * savings it was added for.
 */
export function fetchDepthArgs(depth: number): string[] {
  return isShallowRepository() ? [`--depth=${depth}`] : [];
}

function isShallowRepository(): boolean {
  try {
    return gitOutput("rev-parse", "--is-shallow-repository") === "true";
  } catch {
    // No repository yet, or a git old enough not to know the flag. Treat the
    // checkout as complete: fetching more than necessary is recoverable,
    // truncating history is not.
    return false;
  }
}

function gitOutput(...args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/**
 * Restore the common history needed for PR diffs after the base ref has been
 * fetched. Keep both the checkout and the trusted base pinned to their SHAs.
 */
export async function ensurePullRequestMergeBase(
  octokit: Octokit,
  repository: { owner: string; repo: string },
  baseBranch: string,
): Promise<void> {
  if (!isShallowRepository()) return;

  try {
    const base = gitOutput(
      "rev-parse",
      "--verify",
      `refs/remotes/origin/${baseBranch}`,
    );
    const head = gitOutput("rev-parse", "--verify", "HEAD");
    const mergeBase = spawnSync("git", ["merge-base", base, head], {
      stdio: "ignore",
    });
    if (mergeBase.status === 0) return;

    const { data } = await octokit.rest.repos.compareCommitsWithBasehead({
      owner: repository.owner,
      repo: repository.repo,
      basehead: `${base}...${head}`,
      per_page: 1,
    });
    // Depth counts the merge base as well as the commits ahead of or behind it.
    const depth = Math.max(data.ahead_by, data.behind_by) + 1;
    gitOutput(
      "fetch",
      "--no-tags",
      "--no-recurse-submodules",
      `--depth=${depth}`,
      "origin",
      base,
      head,
    );
    gitOutput("merge-base", base, head);
    core.info(`Fetched PR history through the merge base (depth ${depth}).`);
  } catch {
    core.warning(
      "Could not fetch the pull request's merge base. Set fetch-depth: 0 in actions/checkout if the workflow needs the full history.",
    );
  }
}
