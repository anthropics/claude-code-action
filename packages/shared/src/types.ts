export interface ClaudeExecutionOptions {
  model?: string;
  timeoutMinutes?: number;
  allowedTools?: string[];
  maxTokens?: number;
  customInstructions?: string;
  workingDirectory?: string;
  sessionId?: string;
  resume?: boolean;
  permissionMode?: string;
}

export interface SessionContext {
  platform: "slack";
  channelId: string;
  userId: string;
  messageTs?: string;
  threadTs?: string;
  conversationHistory?: ConversationMessage[];
  customInstructions?: string;
  workingDirectory?: string;
  repositoryUrl?: string;
  gitBranch?: string;
}

export interface ConversationMessage {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: number;
}