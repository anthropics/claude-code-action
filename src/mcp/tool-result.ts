/**
 * The MCP result envelope the in-process GitHub servers return.
 *
 * Shared so the four servers cannot drift apart on the error shape — the
 * `isError` flag plus the `Error: <message>` text is what the model sees when a
 * tool call fails, and it is asserted in the server tests.
 */
export type ToolResult = {
  content: { type: "text"; text: string }[];
  error?: string;
  isError?: boolean;
};

export function toolSuccess(payload: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export function toolError(error: unknown): ToolResult {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text",
        text: `Error: ${errorMessage}`,
      },
    ],
    error: errorMessage,
    isError: true,
  };
}
