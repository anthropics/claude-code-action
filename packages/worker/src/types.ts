#!/usr/bin/env bun


export interface WorkerConfig {
  sessionKey: string;
  userId: string;
  channelId: string;
  threadTs?: string;
  repositoryUrl: string;
  userPrompt: string; // Base64 encoded
  slackResponseChannel: string;
  slackResponseTs: string;
  claudeOptions: string; // JSON string
  sessionId?: string; // Claude session ID for new sessions
  resumeSessionId?: string; // Claude session ID to resume from
  workspace: {
    baseDirectory: string;
    githubToken: string;
  };
}

export interface WorkspaceSetupConfig {
  baseDirectory: string;
  githubToken: string;
}


export interface GitRepository {
  url: string;
  branch: string;
  directory: string;
  lastCommit?: string;
}

export interface WorkspaceInfo {
  baseDirectory: string;
  userDirectory: string;
  repository: GitRepository;
  setupComplete: boolean;
}

// Error types
export class WorkerError extends Error {
  constructor(
    public operation: string,
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = "WorkerError";
  }
}

export class WorkspaceError extends Error {
  constructor(
    public operation: string,
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}

export class SlackError extends Error {
  constructor(
    public operation: string,
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = "SlackError";
  }
}