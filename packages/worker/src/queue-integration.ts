#!/usr/bin/env bun

import PgBoss from "pg-boss";
import logger from "./logger";

interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
}

interface ThreadResponsePayload {
  messageId: string;
  channelId: string;
  threadTs: string;
  userId: string;
  content?: string;
  isDone: boolean;
  error?: string;
  timestamp: number;
  originalMessageTs?: string; // User's original message timestamp for reactions
}

export class QueueIntegration {
  private pgBoss: PgBoss;
  private isConnected = false;
  private responseChannel: string;
  private responseTs: string;
  private messageId: string;
  private lastUpdateTime = 0;
  private updateQueue: string[] = [];
  private isProcessingQueue = false;
  private currentTodos: TodoItem[] = [];
  // @ts-ignore - Used in showStopButton() and hideStopButton() methods
  private stopButtonVisible: boolean = false;
  private deploymentName?: string;

  constructor(config: { 
    databaseUrl: string;
    responseChannel?: string; 
    responseTs?: string;
    messageId?: string;
  }) {
    this.pgBoss = new PgBoss(config.databaseUrl);
    
    // Get response location from config or environment
    this.responseChannel = config.responseChannel || process.env.INITIAL_SLACK_RESPONSE_CHANNEL || process.env.SLACK_RESPONSE_CHANNEL!;
    this.responseTs = config.responseTs || process.env.INITIAL_SLACK_RESPONSE_TS || process.env.SLACK_RESPONSE_TS!;
    this.messageId = config.messageId || process.env.INITIAL_SLACK_MESSAGE_ID || process.env.SLACK_MESSAGE_ID!;
    
    // Get deployment name from environment for stop button
    this.deploymentName = process.env.DEPLOYMENT_NAME;
    
    // Validate required values
    if (!this.responseChannel || !this.responseTs || !this.messageId) {
      const error = new Error(
        `Missing required response location - channel: "${this.responseChannel}", ts: "${this.responseTs}", messageId: "${this.messageId}"`
      );
      logger.error(`QueueIntegration initialization failed: ${error.message}`);
      throw error;
    }
    
    logger.info(`QueueIntegration initialized - channel: ${this.responseChannel}, ts: ${this.responseTs}, messageId: ${this.messageId}`);
  }

  /**
   * Start the queue connection
   */
  async start(): Promise<void> {
    try {
      await this.pgBoss.start();
      this.isConnected = true;
      
      // Create the thread_response queue if it doesn't exist
      await this.pgBoss.createQueue('thread_response');
      logger.info("✅ Queue integration started successfully");
    } catch (error) {
      logger.error("Failed to start queue integration:", error);
      throw error;
    }
  }

  /**
   * Stop the queue connection
   */
  async stop(): Promise<void> {
    try {
      this.isConnected = false;
      await this.pgBoss.stop();
      logger.info("✅ Queue integration stopped");
    } catch (error) {
      logger.error("Error stopping queue integration:", error);
      throw error;
    }
  }

  /**
   * Update progress message via queue
   */
  async updateProgress(content: string): Promise<void> {
    try {
      // Ensure we always have content to update with
      if (!content || content.trim() === "") {
        logger.warn("updateProgress called with empty content, using default message");
        content = "✅ Task completed";
      }
      
      // Rate limiting: don't update more than once every 2 seconds
      const now = Date.now();
      if (now - this.lastUpdateTime < 2000) {
        // Queue the update
        this.updateQueue.push(content);
        this.processQueue();
        return;
      }

      await this.performUpdate(content);
      this.lastUpdateTime = now;

    } catch (error) {
      logger.error("Failed to send progress update to queue:", error);
      // Don't throw - worker should continue even if queue updates fail
    }
  }

  /**
   * Stream progress updates (for real-time Claude output)
   */
  async streamProgress(data: any): Promise<void> {
    try {
      // Handle both string and object data
      let dataToCheck: string;
      
      if (typeof data === "string" && data.trim()) {
        dataToCheck = data;
      } else if (typeof data === "object") {
        dataToCheck = JSON.stringify(data);
      } else {
        return;
      }
      
      // Check if this contains TodoWrite tool usage
      const todoData = this.extractTodoList(dataToCheck);
      if (todoData) {
        this.currentTodos = todoData;
        await this.updateProgressWithTodos();
        return;
      }
      
      // Stream the content normally
      if (typeof data === "string") {
        await this.updateProgress(data);
      } else if (typeof data === "object" && data.content) {
        await this.updateProgress(data.content);
      }
    } catch (error) {
      logger.error("Failed to stream progress:", error);
    }
  }

  /**
   * Process queued updates
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.updateQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      // Wait for rate limit, then send the latest update
      const delay = Math.max(0, 2000 - (Date.now() - this.lastUpdateTime));
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Get the latest update from queue
      const latestUpdate = this.updateQueue.pop();
      this.updateQueue = []; // Clear queue

      if (latestUpdate) {
        await this.performUpdate(latestUpdate);
        this.lastUpdateTime = Date.now();
      }

    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Perform the actual queue update
   */
  private async performUpdate(content: string): Promise<void> {
    if (!this.isConnected) {
      logger.warn("Queue not connected, skipping update");
      return;
    }

    try {
      // Final safety check - ensure we have content
      if (!content || content.trim() === "") {
        logger.warn("performUpdate called with empty content, using fallback");
        content = "✅ Task completed";
      }
      
      logger.info(`Sending progress update to thread_response queue, content length: ${content.length}`);
      
      // Debug the properties to see if they're corrupted
      logger.info(`DEBUG: messageId type=${typeof this.messageId}, value=${JSON.stringify(this.messageId)}`);
      logger.info(`DEBUG: responseChannel type=${typeof this.responseChannel}, value=${JSON.stringify(this.responseChannel)}`);
      logger.info(`DEBUG: responseTs type=${typeof this.responseTs}, value=${JSON.stringify(this.responseTs)}`);
      
      const payload: ThreadResponsePayload = {
        messageId: this.messageId,
        channelId: this.responseChannel,
        threadTs: this.responseTs,
        userId: process.env.USER_ID || 'unknown',
        content: content,
        isDone: false, // Agent is still running
        timestamp: Date.now(),
        originalMessageTs: process.env.ORIGINAL_MESSAGE_TS // User's original message for reactions
      };

      // Send to thread_response queue
      const jobId = await this.pgBoss.send('thread_response', payload, {
        priority: 0,
        retryLimit: 3,
        retryDelay: 5,
        expireInHours: 1,
      });
      
      logger.info(`Sent progress update to queue with job id: ${jobId}`);

    } catch (error: any) {
      logger.error("Failed to send update to thread_response queue:", error);
      throw error;
    }
  }

  // Reaction methods removed - dispatcher now handles reactions directly based on isDone status

  /**
   * Send typing indicator via queue
   */
  async sendTyping(): Promise<void> {
    try {
      // Show current todos if available, otherwise show thinking message
      if (this.currentTodos.length > 0) {
        await this.updateProgressWithTodos();
      } else {
        // Post a temporary "typing" message that we'll update
        await this.updateProgress("💭 Claude is thinking...");
      }

    } catch (error) {
      logger.error("Failed to send typing indicator:", error);
    }
  }

  /**
   * Signal that the agent is done processing
   */
  async signalDone(finalMessage?: string): Promise<void> {
    if (!this.isConnected) {
      logger.warn("Queue not connected, skipping done signal");
      return;
    }

    try {
      const payload: ThreadResponsePayload = {
        messageId: this.messageId,
        channelId: this.responseChannel,
        threadTs: this.responseTs,
        userId: process.env.USER_ID || 'unknown',
        content: finalMessage,
        isDone: true, // Agent is done
        timestamp: Date.now(),
        originalMessageTs: process.env.ORIGINAL_MESSAGE_TS // User's original message for reactions
      };

      const jobId = await this.pgBoss.send('thread_response', payload, {
        priority: 1, // Higher priority for completion signals
        retryLimit: 5,
        retryDelay: 5,
        expireInHours: 1,
      });
      
      logger.info(`Sent completion signal to queue with job id: ${jobId}`);

    } catch (error: any) {
      logger.error("Failed to send completion signal to queue:", error);
      throw error;
    }
  }

  /**
   * Signal that an error occurred
   */
  async signalError(error: Error): Promise<void> {
    if (!this.isConnected) {
      logger.warn("Queue not connected, skipping error signal");
      return;
    }

    try {
      const payload: ThreadResponsePayload = {
        messageId: this.messageId,
        channelId: this.responseChannel,
        threadTs: this.responseTs,
        userId: process.env.USER_ID || 'unknown',
        error: error.message,
        isDone: true, // Agent is done due to error
        timestamp: Date.now(),
        originalMessageTs: process.env.ORIGINAL_MESSAGE_TS // User's original message for reactions
      };

      const jobId = await this.pgBoss.send('thread_response', payload, {
        priority: 1, // Higher priority for error signals
        retryLimit: 5,
        retryDelay: 5,
        expireInHours: 1,
      });
      
      logger.info(`Sent error signal to queue with job id: ${jobId}`);

    } catch (sendError: any) {
      logger.error("Failed to send error signal to queue:", sendError);
      // Don't throw here - we're already handling an error
    }
  }

  /**
   * Format error message
   */
  formatError(error: Error, context?: string): string {
    const parts = ["❌ **Error occurred**"];
    
    if (context) {
      parts.push(`**Context:** ${context}`);
    }
    
    parts.push(`**Error:** \`${error.message}\``);
    
    if (error.stack) {
      parts.push(`**Stack trace:**\n\`\`\`\n${error.stack.substring(0, 500)}\n\`\`\``);
    }
    
    return parts.join("\n\n");
  }

  /**
   * Format success message
   */
  formatSuccess(message: string, details?: Record<string, any>): string {
    const parts = [`✅ **${message}**`];
    
    if (details) {
      for (const [key, value] of Object.entries(details)) {
        parts.push(`**${key}:** \`${value}\``);
      }
    }
    
    return parts.join("\n");
  }

  /**
   * Extract todo list from Claude's JSON output
   */
  private extractTodoList(data: string): TodoItem[] | null {
    try {
      const lines = data.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('{')) {
          const parsed = JSON.parse(line);
          
          // Check if this is a tool_use for TodoWrite
          if (parsed.type === "assistant" && parsed.message?.content) {
            for (const content of parsed.message.content) {
              if (content.type === "tool_use" && content.name === "TodoWrite" && content.input?.todos) {
                return content.input.todos;
              }
            }
          }
          
          // Check if this is a tool_result from TodoWrite
          if (parsed.type === "user" && parsed.message?.content) {
            for (const content of parsed.message.content) {
              if (content.type === "tool_result" && content.content?.includes("Todos have been modified successfully")) {
                // Try to extract todos from previous context
                return null; // Let the assistant message handle this
              }
            }
          }
        }
      }
    } catch (error) {
      // Not JSON or parsing failed
    }
    return null;
  }

  /**
   * Update progress with todo list display
   */
  private async updateProgressWithTodos(): Promise<void> {
    if (this.currentTodos.length === 0) {
      await this.updateProgress("📝 Task list updated");
      return;
    }

    const todoDisplay = this.formatTodoList(this.currentTodos);
    await this.updateProgress(todoDisplay);
  }

  /**
   * Format todo list for display
   */
  private formatTodoList(todos: TodoItem[]): string {
    const todoLines = todos.map(todo => {
      const checkbox = todo.status === "completed" ? "☑️" : "☐";
      const status = todo.status === "in_progress" ? " (in progress)" : "";
      return `${checkbox} ${todo.content}${status}`;
    });

    return `📝 **Task Progress**\n\n${todoLines.join('\n')}`;
  }

  /**
   * Show stop button in messages
   * Called when Claude worker starts processing
   */
  showStopButton(): void {
    this.stopButtonVisible = true;
    logger.info("Stop button enabled for deployment:", this.deploymentName);
  }

  /**
   * Hide stop button from messages
   * Called when Claude worker finishes or times out
   */
  hideStopButton(): void {
    this.stopButtonVisible = false;
    logger.info("Stop button disabled for deployment:", this.deploymentName);
  }

  /**
   * Cleanup queue integration
   */
  cleanup(): void {
    // Hide stop button before cleanup
    this.hideStopButton();
    
    // Clear any pending updates
    this.updateQueue = [];
    this.isProcessingQueue = false;
    this.currentTodos = [];
  }

  /**
   * Check if queue integration is connected
   */
  isHealthy(): boolean {
    return this.isConnected;
  }
}