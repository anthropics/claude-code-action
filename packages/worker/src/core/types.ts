#!/usr/bin/env bun

// Core Claude execution types
export interface ClaudeExecutionOptions {
  allowedTools?: string;
  disallowedTools?: string;
  maxTurns?: string;
  mcpConfig?: string;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  claudeEnv?: string;
  fallbackModel?: string;
  timeoutMinutes?: string;
  model?: string;
  sessionId?: string;
  resumeSessionId?: string;
}

export interface ClaudeExecutionResult {
  success: boolean;
  exitCode: number;
  output: string;
  executionFile?: string;
  error?: string;
}

export interface ProgressUpdate {
  type: "output" | "completion" | "error";
  data: any;
  timestamp: number;
}

export type ProgressCallback = (update: ProgressUpdate) => Promise<void>;

// Session management types
export interface SessionContext {
  platform: "slack" | "github";
  channelId: string;
  userId: string;
  userDisplayName?: string;
  teamId?: string;
  threadTs?: string;
  messageTs: string;
  repositoryUrl?: string;
  workingDirectory?: string;
  customInstructions?: string;
  conversationHistory?: ConversationMessage[];
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  metadata?: {
    messageTs?: string;
    threadTs?: string;
    userId?: string;
    progressUpdate?: ProgressUpdate;
  };
}

export interface SessionState {
  sessionKey: string;
  context: SessionContext;
  conversation: ConversationMessage[];
  createdAt: number;
  lastActivity: number;
  status: "active" | "idle" | "completed" | "error" | "timeout";
  workspaceInfo?: {
    repositoryUrl: string;
    branch: string;
    workingDirectory: string;
  };
  progress?: {
    currentStep?: string;
    totalSteps?: number;
    lastUpdate?: ProgressUpdate;
  };
}

// Conversation metadata types
export interface ConversationMetadata {
  sessionKey: string;
  createdAt: number;
  lastActivity: number;
  messageCount: number;
  platform: string;
  userId: string;
  channelId: string;
  status: SessionState["status"];
}

// Thread-based routing types
export interface ThreadSession {
  sessionKey: string;
  threadTs: string;
  channelId: string;
  userId: string;
  workerId?: string;
  lastActivity: number;
  status: "pending" | "running" | "completed" | "error";
}

// Worker execution types
export interface WorkerConfig {
  workerId: string;
  namespace: string;
  image: string;
  cpu: string;
  memory: string;
  timeoutSeconds: number;
  env: Record<string, string>;
}

export interface WorkerJobSpec {
  sessionKey: string;
  userId: string;
  channelId: string;
  threadTs?: string;
  repositoryUrl: string;
  workingDirectory: string;
  userPrompt: string;
  claudeOptions: ClaudeExecutionOptions;
  slackResponseChannel: string;
  slackResponseTs: string;
}

// Error types
export class SessionError extends Error {
  constructor(
    public sessionKey: string,
    public code: string,
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = "SessionError";
  }
}


export class WorkerError extends Error {
  constructor(
    public workerId: string,
    public operation: string,
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = "WorkerError";
  }
}