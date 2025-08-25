#!/usr/bin/env bun

import type { LogLevel } from "@slack/bolt";
import type { ClaudeExecutionOptions } from "@claude-code-slack/core-runner";

export interface SlackConfig {
  token: string;
  appToken?: string;
  signingSecret?: string;
  socketMode?: boolean;
  port?: number;
  botUserId?: string;
  botId?: string;
  allowedUsers?: string[];
  allowedChannels?: string[];
  blockedUsers?: string[];
  blockedChannels?: string[];
  allowDirectMessages?: boolean;
  allowPrivateChannels?: boolean;
}


export interface GitHubConfig {
  token: string;
  organization: string;
  repoTemplate?: string;
  repository?: string; // Override repository URL instead of creating user-specific ones
}

export interface QueueConfig {
  directMessage: string;
  messageQueue: string;
  connectionString: string;
  retryLimit?: number;
  retryDelay?: number;
  expireInHours?: number;
}

export interface DispatcherConfig {
  slack: SlackConfig;
  github: GitHubConfig;
  claude: Partial<ClaudeExecutionOptions>;
  sessionTimeoutMinutes: number;
  logLevel?: LogLevel;
  queues: QueueConfig;
}

export interface SlackContext {
  channelId: string;
  userId: string;
  userDisplayName?: string;
  teamId: string;
  threadTs?: string;
  messageTs: string;
  text: string;
  messageUrl?: string;
}

export interface WorkerJobRequest {
  sessionKey: string;
  userId: string;
  username: string;
  channelId: string;
  threadTs?: string;
  userPrompt: string;
  repositoryUrl: string;
  slackResponseChannel: string;
  slackResponseTs: string;
  originalMessageTs?: string; // Original user message timestamp for reactions
  claudeOptions: ClaudeExecutionOptions;
  resumeSessionId?: string; // Claude session ID to resume from
}

export interface WorkerDeploymentRequest {
  userId: string;
  botId: string;
  agentSessionId: string;
  threadId: string;
  platform: string;
  platformUserId: string;
  messageId: string;
  messageText: string;
  channelId: string;
  platformMetadata: Record<string, any>;
  claudeOptions: Record<string, any>;
  environmentVariables?: Record<string, string>;
}

export interface ThreadSession {
  sessionKey: string;
  threadTs?: string;
  channelId: string;
  userId: string;
  username: string;
  jobName?: string;
  repositoryUrl: string;
  agentSessionId?: string; // Agent session ID for resumption
  lastActivity: number;
  status: "pending" | "starting" | "running" | "completed" | "error" | "timeout";
  createdAt: number;
}

export interface UserRepository {
  username: string;
  repositoryName: string;
  repositoryUrl: string;
  cloneUrl: string;
  createdAt: number;
  lastUsed: number;
}


// Error types
export class DispatcherError extends Error {
  constructor(
    public operation: string,
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = "DispatcherError";
  }
}


export class GitHubRepositoryError extends Error {
  constructor(
    public operation: string,
    public username: string,
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = "GitHubRepositoryError";
  }
}