#!/usr/bin/env bun

import { runClaudeWithProgress } from "./claude-execution";
import { SessionManager } from "./session-manager";
import { createPromptFile } from "./prompt-generation";
import logger from "./logger";
import type { 
  ClaudeExecutionOptions, 
  ClaudeExecutionResult, 
  ProgressCallback,
  SessionContext,
  SessionState 
} from "./types";

export interface ExecuteClaudeSessionOptions {
  sessionKey: string;
  userPrompt: string;
  context: SessionContext;
  options: ClaudeExecutionOptions;
  onProgress?: ProgressCallback;
}

export interface SessionExecutionResult extends ClaudeExecutionResult {
  sessionKey: string;
  persisted?: boolean;
  storagePath?: string;
}

/**
 * Main interface for executing Claude sessions with thread-based persistence
 */
export class ClaudeSessionRunner {
  private sessionManager: SessionManager;

  constructor(config: {
    timeoutMinutes?: number;
  } = {}) {
    this.sessionManager = new SessionManager({
      timeoutMinutes: config.timeoutMinutes
    });
  }

  /**
   * Execute a Claude session with conversation history
   */
  async executeSession(options: ExecuteClaudeSessionOptions): Promise<SessionExecutionResult> {
    const { sessionKey, userPrompt, context, options: claudeOptions, onProgress } = options;

    try {
      // Create session with conversation history from context
      logger.info(`Creating session ${sessionKey} with ${context.conversationHistory?.length || 0} messages from history`);
      const sessionState = await this.sessionManager.createSession(sessionKey, context);
      
      // Add conversation history to session if provided
      if (context.conversationHistory && context.conversationHistory.length > 0) {
        sessionState.conversation = [...context.conversationHistory];
        logger.info(`Loaded ${context.conversationHistory.length} messages into session`);
      }

      // Add user message to conversation
      const userMessage = {
        role: "user" as const,
        content: userPrompt,
        timestamp: Date.now(),
      };
      
      // Add to session state's conversation directly since addMessage is a no-op
      sessionState.conversation.push(userMessage);
      
      // Also call the session manager method for consistency
      await this.sessionManager.addMessage(sessionKey, userMessage);

      // Create prompt file with full conversation context (now includes the user message)
      const promptPath = await createPromptFile(context, sessionState.conversation);

      // Start session timeout monitoring
      this.sessionManager.startTimeoutMonitoring(sessionKey);

      // Execute Claude with progress monitoring
      const result = await runClaudeWithProgress(
        promptPath,
        claudeOptions,
        async (update) => {
          // Reset session timeout on activity
          this.sessionManager.resetTimeout(sessionKey);
          
          // Persist progress to session
          await this.sessionManager.updateProgress(sessionKey, update);
          
          // Call external progress callback
          if (onProgress) {
            await onProgress(update);
          }
        },
        context.workingDirectory // Pass working directory
      );

      // Add Claude's response to conversation
      if (result.success && result.output) {
        await this.sessionManager.addMessage(sessionKey, {
          role: "assistant", 
          content: result.output,
          timestamp: Date.now(),
        });
      }

      // Clean up session timeout
      this.sessionManager.clearTimeout(sessionKey);

      return {
        ...result,
        sessionKey,
        persisted: false, // No persistence needed - Slack is the source of truth
        storagePath: "slack://thread", // Indicate data is in Slack
      };

    } catch (error) {
      logger.error(`Session ${sessionKey} execution failed:`, error);
      
      // Clean up
      this.sessionManager.clearTimeout(sessionKey);

      return {
        success: false,
        exitCode: 1,
        output: "",
        error: error instanceof Error ? error.message : "Unknown error",
        sessionKey,
      };
    }
  }

  /**
   * Clean up session resources
   */
  async cleanupSession(sessionKey: string): Promise<void> {
    await this.sessionManager.cleanup(sessionKey);
  }

  /**
   * Get current session state (always returns null in stateless mode)
   */
  async getSessionState(_sessionKey: string): Promise<SessionState | null> {
    // Always return null since we don't store sessions
    return null;
  }

  /**
   * Check if session exists (always returns false in stateless mode)
   */
  async sessionExists(sessionKey: string): Promise<boolean> {
    return this.sessionManager.sessionExists(sessionKey);
  }
}

// Re-export types and utilities
export type {
  ClaudeExecutionOptions,
  ClaudeExecutionResult,
  ProgressCallback,
  SessionContext,
  SessionState,
} from "./types";

export { SessionManager } from "./session-manager";
export { runClaudeWithProgress } from "./claude-execution";
export { createPromptFile } from "./prompt-generation";
