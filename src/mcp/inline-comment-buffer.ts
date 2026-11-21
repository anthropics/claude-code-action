import { existsSync, readFileSync, writeFileSync } from "fs";

export type BufferedCommentMatch = {
  path: string;
  line?: number;
  startLine?: number;
  side?: "LEFT" | "RIGHT";
  commit_id?: string;
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
 * Match the diff location, commit and body. An omitted side means RIGHT, and
 * an omitted commit uses the PR head observed when posting. Keep lines that
 * cannot be parsed.
 */
export function removeBufferedComment(
  match: BufferedCommentMatch,
  bufferPath: string,
  headSha?: string,
): void {
  if (!existsSync(bufferPath)) {
    return;
  }

  const postedCommit = match.commit_id || headSha;
  const postedSide = match.side || "RIGHT";
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
        (entry.side || "RIGHT") === postedSide &&
        (entry.commit_id || headSha) === postedCommit &&
        entry.body === match.body;
      return !isSameComment;
    });

  writeFileSync(
    bufferPath,
    remaining.length > 0 ? remaining.join("\n") + "\n" : "",
  );
}
