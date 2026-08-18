import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

export type BufferedCommentMatch = {
  path: string;
  line?: number;
  startLine?: number;
  body: string;
};

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

/**
 * Return a buffer path scoped to one repository workflow run and attempt.
 *
 * Self-hosted runners can be reused by multiple repositories, so a fixed
 * machine-wide path can replay another run's buffered review comments.
 */
export function getInlineCommentBufferPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const runnerTemp = env.RUNNER_TEMP || "/tmp";
  const repository =
    env.GITHUB_REPOSITORY ||
    [env.REPO_OWNER, env.REPO_NAME].filter(Boolean).join("/") ||
    "local";
  const runId = env.GITHUB_RUN_ID || "local";
  const runAttempt = env.GITHUB_RUN_ATTEMPT || "1";

  return join(
    runnerTemp,
    `inline-comments-buffer-${sanitizePathSegment(repository)}-${sanitizePathSegment(runId)}-${sanitizePathSegment(runAttempt)}.jsonl`,
  );
}

/**
 * Read and remove a completed run's buffer before processing its contents.
 *
 * Removing the file immediately keeps stale comments from surviving parsing,
 * classification, or posting failures.
 */
export function consumeInlineCommentBuffer(
  bufferPath: string,
): string | undefined {
  try {
    return readFileSync(bufferPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  } finally {
    rmSync(bufferPath, { force: true });
  }
}

/**
 * Remove any buffered inline comment that matches an already-posted comment.
 *
 * When a comment is posted live (confirmed=true), an earlier buffered copy of
 * the same comment must be dropped so the post-session replay step does not
 * post it a second time. The model frequently re-issues a buffered call with
 * confirmed=true after reading the "Set confirmed=true to post immediately"
 * reply; previously the original buffered entry was left behind and replayed,
 * producing duplicate inline comments.
 *
 * Entries are matched on path, line, startLine and body. Lines that cannot be
 * parsed are kept untouched.
 */
export function removeBufferedComment(
  match: BufferedCommentMatch,
  bufferPath: string,
): void {
  if (!existsSync(bufferPath)) {
    return;
  }

  const remaining = readFileSync(bufferPath, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .filter((line) => {
      let entry: BufferedCommentMatch;
      try {
        entry = JSON.parse(line);
      } catch {
        // Keep anything we cannot parse rather than silently dropping it.
        return true;
      }
      const isSameComment =
        entry.path === match.path &&
        entry.line === match.line &&
        entry.startLine === match.startLine &&
        entry.body === match.body;
      return !isSameComment;
    });

  writeFileSync(
    bufferPath,
    remaining.length > 0 ? remaining.join("\n") + "\n" : "",
  );
}
