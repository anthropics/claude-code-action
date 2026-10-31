import { existsSync, readFileSync, writeFileSync } from "fs";

export type BufferedCommentMatch = {
  path?: string;
  line?: number;
  startLine?: number;
  in_reply_to_id?: number;
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
 * Entries are matched on body and target identity:
 * - for inline comments: path + line + startLine
 * - for replies: in_reply_to_id
 *
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
        entry.in_reply_to_id === match.in_reply_to_id &&
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
