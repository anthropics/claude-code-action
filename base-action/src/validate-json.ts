export class JsonParseError extends Error {
  constructor(
    public readonly source: string,
    public readonly underlyingMessage: string,
    public readonly line: number | null,
    public readonly column: number | null,
  ) {
    super(buildErrorMessage(source, underlyingMessage, line, column));
    this.name = "JsonParseError";
  }
}

export function parseJsonWithLocation<T = unknown>(
  text: string,
  source: string,
): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const underlyingMessage =
      error instanceof Error ? error.message : String(error);
    const position = extractPosition(underlyingMessage);
    const location = position === null ? null : toLineColumn(text, position);
    throw new JsonParseError(
      source,
      underlyingMessage,
      location?.line ?? null,
      location?.column ?? null,
    );
  }
}

function buildErrorMessage(
  source: string,
  underlyingMessage: string,
  line: number | null,
  column: number | null,
): string {
  const prefix = `Invalid JSON in ${source}: ${underlyingMessage}`;
  if (line === null || column === null) {
    return prefix;
  }
  return `${prefix} (line ${line}, column ${column})`;
}

function extractPosition(message: string): number | null {
  const match = message.match(/position\s+(\d+)/i);
  if (match === null) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function toLineColumn(
  text: string,
  position: number,
): { line: number; column: number } {
  const safePosition = Math.min(Math.max(position, 0), text.length);
  const before = text.slice(0, safePosition);
  const lineBreaks = before.split("\n");
  const currentLine = lineBreaks[lineBreaks.length - 1] ?? "";
  return {
    line: lineBreaks.length,
    column: currentLine.length + 1,
  };
}
