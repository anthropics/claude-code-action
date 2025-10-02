export type ClaudeMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ClaudeRequest = {
  system?: string;
  messages: ClaudeMessage[];
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

