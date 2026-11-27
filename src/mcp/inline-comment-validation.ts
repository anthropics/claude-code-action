export function validateCommentLines(
  line?: number,
  startLine?: number,
): { isSingleLine: boolean } {
  if (line === undefined && startLine === undefined) {
    throw new Error(
      "Either 'line' for single-line comments or both 'startLine' and 'line' for multi-line comments must be provided",
    );
  }

  if (startLine !== undefined && line === undefined) {
    throw new Error(
      "When 'startLine' is provided, 'line' must also be provided to specify the end of the range",
    );
  }

  return { isSingleLine: startLine === undefined };
}
