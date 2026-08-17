import { existsSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Absolute path of the inline-comment buffer for the current job.
 *
 * A fixed `/tmp` path is unsafe on self-hosted runners, where the machine and
 * its `/tmp` persist between jobs: a run could replay comments buffered by an
 * earlier run, and concurrent jobs (including jobs for different repositories)
 * would append to and truncate the same file. GitHub allocates `RUNNER_TEMP`
 * per job and clears it between jobs, and each runner on a shared machine gets
 * its own, so scoping the buffer to it isolates runs without any cleanup of our
 * own. Falls back to the OS temp dir when running outside Actions.
 */
export function getInlineCommentBufferPath(): string {
  const dir = process.env.RUNNER_TEMP || tmpdir();
  return join(dir, "inline-comments-buffer.jsonl");
}

export type BufferedCommentMatch = {
  path: string;
  line?: number;
  startLine?: number;
  body: string;
};

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
