import { execFileSync } from "child_process";

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
    const output = execFileSync(
      "git",
      ["rev-parse", "--is-shallow-repository"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return output.trim() === "true";
  } catch {
    // No repository yet, or a git old enough not to know the flag. Treat the
    // checkout as complete: fetching more than necessary is recoverable,
    // truncating history is not.
    return false;
  }
}
