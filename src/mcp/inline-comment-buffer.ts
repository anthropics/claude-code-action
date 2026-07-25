import { existsSync, readFileSync, writeFileSync } from "fs";

// RUNNER_TEMP is job-scoped on GitHub-hosted runners; on non-ephemeral
// self-hosted runners it can persist between jobs, same as bare /tmp (see the
// promptDir clear-before-use in src/create-prompt/index.ts for the same
// concern). Callers that read/write this file are responsible for clearing
// stale state before a session starts and removing it once fully consumed —
// see prepareMcpConfig() and post-buffered-inline-comments.ts.
export const BUFFER_PATH = `${process.env.RUNNER_TEMP || "/tmp"}/inline-comments-buffer.jsonl`;

export type BufferedCommentMatch = {
  path: string;
  line?: number;
  startLine?: number;
  body: string;
  side?: "LEFT" | "RIGHT";
  commit_id?: string;
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
 * Entries are matched on path, line, startLine, body, side and commit_id.
 * Lines that cannot be parsed are kept untouched.
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
        entry.body === match.body &&
        entry.side === match.side &&
        entry.commit_id === match.commit_id;
      return !isSameComment;
    });

  writeFileSync(
    bufferPath,
    remaining.length > 0 ? remaining.join("\n") + "\n" : "",
  );
}
