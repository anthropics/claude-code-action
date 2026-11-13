/**
 * Checks the line range of an inline comment before it is buffered or posted.
 *
 * GitHub diff line numbers start at 1. A 0 is falsy, so letting it through
 * made `startLine: 0` silently turn a multi-line comment into a single-line
 * one, and `line: 0` reach the API only to fail there (#1767).
 *
 * Returns an error message, or undefined when the range is valid.
 */
export function validateCommentLines(
  line: number | undefined,
  startLine: number | undefined,
): string | undefined {
  if (line === undefined) {
    return "Either 'line' for single-line comments or both 'startLine' and 'line' for multi-line comments must be provided";
  }
  if (!Number.isInteger(line) || line < 1) {
    return `'line' must be a positive integer (got ${line}); diff lines start at 1`;
  }
  if (startLine === undefined) {
    return undefined;
  }
  if (!Number.isInteger(startLine) || startLine < 1) {
    return `'startLine' must be a positive integer (got ${startLine}); diff lines start at 1`;
  }
  if (startLine > line) {
    return `'startLine' (${startLine}) must not be after 'line' (${line})`;
  }
  return undefined;
}
