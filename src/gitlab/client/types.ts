export type ClaudeMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ClaudeToolResult = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
};

export type ClaudeToolUse = {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
};

