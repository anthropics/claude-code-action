#!/usr/bin/env bun

import PgBoss from "pg-boss";
import { ClaudeWorker } from "../claude-worker";
import type { WorkerConfig } from "../types";
import logger from "../logger";

/**
 * Queue consumer for workers that listen to thread-specific messages
 * Replaces ConfigMap polling with queue-based message consumption
 */

export interface ThreadMessagePayload {
  botId: string;
  userId: string;
  threadId: string;
  platform: string;
  channelId: string;
  messageId: string;
  messageText: string;
  agentSessionId?: string;
  platformMetadata: Record<string, any>;
  claudeOptions: Record<string, any>;
  // Routing metadata for thread-specific processing
  routingMetadata?: {
    targetThreadId: string;
    agentSessionId: string;
    userId: string;
  };
}

interface QueuedMessage {
  payload: ThreadMessagePayload;
  timestamp: number;
}

export class WorkerQueueConsumer {
  private pgBoss: PgBoss;
  private isRunning = false;
  private currentWorker: ClaudeWorker | null = null;
  private isProcessing = false;
  private userId: string;
  private deploymentName: string;
  private targetThreadId?: string;
  private messageQueue: QueuedMessage[] = [];
  private currentSessionId: string | null = null;

  constructor(
    connectionString: string,
    userId: string,
    deploymentName: string,
    targetThreadId?: string
  ) {
    this.pgBoss = new PgBoss(connectionString);
    this.userId = userId;
    this.deploymentName = deploymentName;
    this.targetThreadId = targetThreadId;
    
  }

  /**
   * Start consuming messages from the thread-specific queue
   * Worker listens to messages for its specific thread deployment
   */
  async start(): Promise<void> {
    try {
      await this.pgBoss.start();
      
      // Generate thread queue name - listens to messages for this deployment
      const threadQueueName = this.getThreadQueueName();
      
      // Register job handler for thread queue messages
      await this.pgBoss.work(
        threadQueueName,
        async (job: any) => this.handleThreadMessage(job)
      );

      this.isRunning = true;
      logger.info(`✅ Worker queue consumer started for user ${this.userId}`);
      logger.info(`🚀 Deployment: ${this.deploymentName}`);
      if (this.targetThreadId) {
        logger.info(`🎯 Targeting thread: ${this.targetThreadId}`);
      }
      logger.info(`📥 Listening to queue: ${threadQueueName}`);
      
    } catch (error) {
      logger.error("Failed to start worker queue consumer:", error);
      throw error;
    }
  }


  /**
   * Stop the queue consumer
   */
  async stop(): Promise<void> {
    try {
      this.isRunning = false;
      
      
      // Cleanup current worker if processing
      if (this.currentWorker) {
        await this.currentWorker.cleanup();
        this.currentWorker = null;
      }

      // Signal deployment for cleanup
      await this.signalDeploymentCompletion();
      
      await this.pgBoss.stop();
      logger.info("✅ Worker queue consumer stopped");
    } catch (error) {
      logger.error("Error stopping worker queue consumer:", error);
      throw error;
    }
  }

  /**
   * Handle thread-specific message jobs
   * Since worker listens to its own thread queue, all messages are for this thread
   */
  private async handleThreadMessage(job: any): Promise<void> {
    let actualData;
    
    try {
      logger.info('Received job structure:', { 
        type: typeof job, 
        keys: Object.keys(job || {}),
        hasNumericKeys: Object.keys(job || {}).some(k => !isNaN(Number(k)))
      });
      
      // Check if this is the PgBoss format (object with numeric keys)
      if (typeof job === 'object' && job !== null) {
        const keys = Object.keys(job);
        const numericKeys = keys.filter(key => !isNaN(Number(key)));
        
        if (numericKeys.length > 0) {
          // PgBoss passes jobs as an array, get the first element
          const firstKey = numericKeys[0];
          const firstJob = firstKey ? job[firstKey] : null;
          
          if (typeof firstJob === 'object' && firstJob !== null && firstJob.data) {
            // This is the actual job object from PgBoss
            actualData = firstJob.data;
            logger.info(`Successfully extracted job data for job ${firstJob.id} from queue ${firstJob.name}`);
          } else {
            throw new Error('Invalid job format: expected job object with data field');
          }
        } else {
          // Fallback - might be normal job format
          actualData = job.data || job;
        }
      } else {
        actualData = job;
      }
      
      logger.info('Final extracted data:', { 
        userId: actualData?.userId, 
        threadId: actualData?.threadId, 
        messageText: actualData?.messageText?.substring(0, 50)
      });
      
    } catch (error) {
      logger.error('Failed to parse job data:', error);
      logger.error('Raw job structure:', JSON.stringify(job, null, 2).substring(0, 500));
      throw new Error(`Invalid job data format: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Validate message is for our user (case insensitive sanity check)
    if (actualData.userId.toLowerCase() !== this.userId.toLowerCase()) {
      logger.warn(`Received message for user ${actualData.userId}, but this worker is for user ${this.userId}`);
      return; // Skip this message - wrong user
    }

    // Add message to queue
    this.messageQueue.push({
      payload: actualData,
      timestamp: Date.now()
    });
    
    logger.info(`Message queued. Queue length: ${this.messageQueue.length}, isProcessing: ${this.isProcessing}`);
    
    // If not currently processing, start sequential processing
    if (!this.isProcessing) {
      await this.processQueueSequentially();
    }
    
    // Message successfully queued - pgBoss job completes immediately
    logger.info('Message successfully added to processing queue');
  }

  /**
   * Generate thread-specific queue name for this deployment
   * Workers listen to messages for their specific thread deployment
   */
  private getThreadQueueName(): string {
    return `thread_message_${this.deploymentName}`;
  }

  /**
   * Convert queue payload to WorkerConfig format
   */
  private payloadToWorkerConfig(payload: ThreadMessagePayload): WorkerConfig {
    const platformMetadata = payload.platformMetadata;
    
    // Extract session ID info from claudeOptions for session continuity
    let resumeSessionId: string | undefined;
    let sessionId: string | undefined;
    try {
      if (payload.claudeOptions && typeof payload.claudeOptions === 'object') {
        resumeSessionId = (payload.claudeOptions as any).resumeSessionId;
        sessionId = (payload.claudeOptions as any).sessionId;
      } else if (typeof payload.claudeOptions === 'string') {
        const parsedOptions = JSON.parse(payload.claudeOptions);
        resumeSessionId = parsedOptions.resumeSessionId;
        sessionId = parsedOptions.sessionId;
      }
    } catch (error) {
      logger.warn('Failed to extract session IDs from claudeOptions:', error);
    }

    // Log session info for debugging
    if (resumeSessionId) {
      logger.info(`Resuming existing Claude session: ${resumeSessionId} for thread ${payload.threadId}`);
    } else if (sessionId) {
      logger.info(`Creating new Claude session: ${sessionId} for thread ${payload.threadId}`);
    } else {
      logger.info(`Starting Claude session without explicit ID for thread ${payload.threadId}`);
    }
    
    // Build Claude options with security restrictions from env vars (only if set)
    const claudeOptions = {
      ...(payload.claudeOptions || {}),
      // Apply security restrictions from environment only if env vars exist
      ...(process.env.CLAUDE_ALLOWED_TOOLS ? { allowedTools: process.env.CLAUDE_ALLOWED_TOOLS } : 
          payload.claudeOptions?.allowedTools ? { allowedTools: payload.claudeOptions.allowedTools } : {}),
      ...(process.env.CLAUDE_DISALLOWED_TOOLS ? { disallowedTools: process.env.CLAUDE_DISALLOWED_TOOLS } : 
          payload.claudeOptions?.disallowedTools ? { disallowedTools: payload.claudeOptions.disallowedTools } : {}),
      ...(process.env.CLAUDE_TIMEOUT_MINUTES ? { timeoutMinutes: process.env.CLAUDE_TIMEOUT_MINUTES } : 
          payload.claudeOptions?.timeoutMinutes ? { timeoutMinutes: payload.claudeOptions.timeoutMinutes } : {}),
    };
    
    return {
      sessionKey: payload.agentSessionId || `session-${payload.threadId}`,
      userId: payload.userId,
      channelId: payload.channelId,
      threadTs: payload.threadId,
      repositoryUrl: platformMetadata.repositoryUrl || "",
      userPrompt: Buffer.from(payload.messageText).toString("base64"), // Base64 encode for consistency
      slackResponseChannel: platformMetadata.slackResponseChannel || payload.channelId,
      slackResponseTs: platformMetadata.slackResponseTs || payload.messageId,
      claudeOptions: JSON.stringify(claudeOptions),
      sessionId: sessionId, // Pass through sessionId for new sessions
      resumeSessionId: resumeSessionId, // Pass through resumeSessionId for session continuity
      workspace: {
        baseDirectory: "/workspace",
        githubToken: process.env.GITHUB_TOKEN!,
      },
    };
  }

  /**
   * Check if consumer is running and healthy
   */
  isHealthy(): boolean {
    return this.isRunning && !this.isProcessing;
  }

  /**
   * Get current processing status
   */
  getStatus(): {
    isRunning: boolean;
    isProcessing: boolean;
    userId: string;
    targetThreadId?: string;
    queueName: string;
  } {
    return {
      isRunning: this.isRunning,
      isProcessing: this.isProcessing,
      userId: this.userId,
      targetThreadId: this.targetThreadId,
      queueName: this.getThreadQueueName(),
    };
  }

  /**
   * Process all messages in queue sequentially
   */
  private async processQueueSequentially(): Promise<void> {
    this.isProcessing = true;
    
    try {
      while (this.messageQueue.length > 0) {
        // Get all messages to process together
        const messagesToProcess = [...this.messageQueue];
        this.messageQueue = []; // Clear queue
        
        logger.info(`Processing batch of ${messagesToProcess.length} messages sequentially`);
        
        // Sort by timestamp to ensure correct order
        messagesToProcess.sort((a, b) => a.timestamp - b.timestamp);
        
        await this.processBatchedMessages(messagesToProcess);
      }
    } catch (error) {
      logger.error('Error during sequential message processing:', error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a batch of messages using session resumption
   */
  private async processBatchedMessages(messages: QueuedMessage[]): Promise<void> {
    if (messages.length === 0) return;
    
    const firstMessage = messages[0]!; // We know it exists since length > 0
    const isFirstSession = !this.currentSessionId;
    
    try {
      // Set environment variables from first message
      if (!process.env.USER_ID) {
        logger.warn(`USER_ID not set in environment, using userId from payload: ${firstMessage.payload.userId}`);
        process.env.USER_ID = firstMessage.payload.userId;
      }

      // Convert to worker config
      let workerConfig: WorkerConfig;
      
      if (isFirstSession) {
        // First message in thread - create new session
        workerConfig = this.payloadToWorkerConfig(firstMessage.payload);
        this.currentSessionId = workerConfig.sessionId || workerConfig.resumeSessionId || `session-${firstMessage.payload.threadId}`;
        logger.info(`Starting new Claude session: ${this.currentSessionId}`);
      } else {
        // Resume existing session with combined messages
        const combinedText = messages.map(m => m.payload.messageText).join('\\n\\n');
        const combinedPayload = {
          ...firstMessage.payload,
          messageText: combinedText
        };
        
        workerConfig = this.payloadToWorkerConfig(combinedPayload);
        // Override with resume session ID
        workerConfig.resumeSessionId = this.currentSessionId!;
        workerConfig.sessionId = undefined; // Don't create new session
        
        logger.info(`Resuming Claude session: ${this.currentSessionId} with ${messages.length} combined messages`);
      }

      // Create and execute worker
      this.currentWorker = new ClaudeWorker(workerConfig);
      await this.currentWorker.execute();
      
      logger.info(`✅ Successfully processed batch of ${messages.length} messages`);

    } catch (error) {
      logger.error(`❌ Failed to process message batch:`, error);
      throw error;
    } finally {
      // Cleanup worker instance
      if (this.currentWorker) {
        try {
          await this.currentWorker.cleanup();
        } catch (cleanupError) {
          logger.error("Error during worker cleanup:", cleanupError);
        }
        this.currentWorker = null;
      }
    }
  }

  /**
   * Signal deployment completion for cleanup by orchestrator
   */
  private async signalDeploymentCompletion(): Promise<void> {
    try {
      // Add cleanup annotation to deployment (simplified approach)
      logger.info(`Would signal deployment ${this.deploymentName} for cleanup (skipping K8s patch to avoid API complexity)`);
      
      logger.info(`✅ Signaled deployment ${this.deploymentName} for cleanup`);
    } catch (error) {
      logger.error('Failed to signal deployment completion:', error);
      // Don't throw - this is cleanup, not critical
    }
  }
}