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

export class WorkerQueueConsumer {
  private pgBoss: PgBoss;
  private isRunning = false;
  private currentWorker: ClaudeWorker | null = null;
  private isProcessing = false;
  private userId: string;
  private deploymentName: string;
  private targetThreadId?: string;
  private lastMessageTime: number = Date.now();
  private exitTimeoutMinutes?: number;
  private exitTimeoutTimer?: NodeJS.Timeout;

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
    
    // Check for exit timeout from environment
    const exitTimeoutEnv = process.env.EXIT_ON_IDLE_MINUTES;
    if (exitTimeoutEnv) {
      this.exitTimeoutMinutes = parseInt(exitTimeoutEnv, 10);
      if (isNaN(this.exitTimeoutMinutes) || this.exitTimeoutMinutes <= 0) {
        logger.warn(`Invalid EXIT_ON_IDLE_MINUTES value: ${exitTimeoutEnv}, ignoring exit timeout`);
        this.exitTimeoutMinutes = undefined;
      } else {
        logger.info(`Exit-on-idle timeout configured: ${this.exitTimeoutMinutes} minutes`);
      }
    }
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
      
      // Start exit timeout monitoring if configured
      this.startExitTimeoutMonitoring();
      
    } catch (error) {
      logger.error("Failed to start worker queue consumer:", error);
      throw error;
    }
  }

  /**
   * Start exit timeout monitoring
   * If configured, will exit the container after specified minutes of inactivity
   */
  private startExitTimeoutMonitoring(): void {
    if (!this.exitTimeoutMinutes) {
      return;
    }

    const checkInterval = 30000; // Check every 30 seconds
    const timeoutMs = this.exitTimeoutMinutes * 60 * 1000;
    
    this.exitTimeoutTimer = setInterval(() => {
      if (!this.isRunning) {
        return;
      }
      
      const now = Date.now();
      const timeSinceLastMessage = now - this.lastMessageTime;
      
      if (timeSinceLastMessage > timeoutMs && !this.isProcessing) {
        logger.info(`⏰ No messages received for ${this.exitTimeoutMinutes} minutes, exiting container with success`);
        logger.info(`Last message was at: ${new Date(this.lastMessageTime).toISOString()}`);
        logger.info(`Current time: ${new Date(now).toISOString()}`);
        
        // Exit with code 0 to indicate successful completion
        this.gracefulExit(0);
      }
    }, checkInterval);
    
    logger.info(`Started exit-on-idle monitoring (${this.exitTimeoutMinutes} minutes timeout)`);
  }

  /**
   * Perform graceful exit
   */
  private async gracefulExit(exitCode: number): Promise<void> {
    try {
      logger.info('Performing graceful exit...');
      await this.stop();
      process.exit(exitCode);
    } catch (error) {
      logger.error('Error during graceful exit:', error);
      process.exit(1);
    }
  }

  /**
   * Stop the queue consumer
   */
  async stop(): Promise<void> {
    try {
      this.isRunning = false;
      
      // Clear exit timeout timer
      if (this.exitTimeoutTimer) {
        clearInterval(this.exitTimeoutTimer);
        this.exitTimeoutTimer = undefined;
      }
      
      // Cleanup current worker if processing
      if (this.currentWorker) {
        await this.currentWorker.cleanup();
        this.currentWorker = null;
      }
      
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

    // Validate message is for our user (sanity check)
    if (actualData.userId !== this.userId) {
      logger.warn(`Received message for user ${actualData.userId}, but this worker is for user ${this.userId}`);
      return; // Skip this message - wrong user
    }

    if (this.isProcessing) {
      logger.warn("Already processing a message, requeueing...");
      throw new Error("Worker busy - message will be retried");
    }

    this.isProcessing = true;
    this.lastMessageTime = Date.now(); // Reset timeout on message received
    const jobId = 'worker-processed'; // Can't extract ID from serialized format

    try {
      logger.info(`Processing thread message job ${jobId} for user ${actualData.userId}, thread ${actualData.threadId}`);

      // User context should be set by orchestrator as environment variable  
      // The DATABASE_URL should already contain user-specific credentials
      if (!process.env.USER_ID) {
        logger.warn(`USER_ID not set in environment, using userId from payload: ${actualData.userId}`);
        process.env.USER_ID = actualData.userId;
      }

      // Convert queue payload to WorkerConfig format
      const workerConfig = this.payloadToWorkerConfig(actualData);

      // Create and execute worker
      this.currentWorker = new ClaudeWorker(workerConfig);
      await this.currentWorker.execute();
      
      logger.info(`✅ Successfully processed user queue message job ${jobId}`);

    } catch (error) {
      logger.error(`❌ Failed to process user queue message job ${jobId}:`, error);
      
      // Re-throw to let pgboss handle retry logic
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
      
      this.isProcessing = false;
    }
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
    
    return {
      sessionKey: payload.agentSessionId || `session-${payload.threadId}`,
      userId: payload.userId,
      channelId: payload.channelId,
      threadTs: payload.threadId,
      repositoryUrl: platformMetadata.repositoryUrl || "",
      userPrompt: Buffer.from(payload.messageText).toString("base64"), // Base64 encode for consistency
      slackResponseChannel: platformMetadata.slackResponseChannel || payload.channelId,
      slackResponseTs: platformMetadata.slackResponseTs || payload.messageId,
      claudeOptions: JSON.stringify(payload.claudeOptions),
      resumeSessionId: undefined, // Don't resume - each message starts fresh
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
}