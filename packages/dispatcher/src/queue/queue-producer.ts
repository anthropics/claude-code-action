#!/usr/bin/env bun

import * as Sentry from "@sentry/node";
import PgBoss from "pg-boss";
import { Pool } from "pg";
import logger from "../logger";

/**
 * Queue producer for dispatching messages to pgboss queues
 * Handles both direct_message and thread_message queues with bot isolation
 */

export interface BotContext {
  botId: string;
  platform: string;
}

export interface WorkerDeploymentPayload {
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

export class QueueProducer {
  private pgBoss: PgBoss;
  private pool?: Pool;
  private isConnected = false;

  constructor(connectionString: string, databaseConfig?: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl?: boolean;
  }) {
    this.pgBoss = new PgBoss(connectionString);
    
    // Create separate pool for RLS context management
    if (databaseConfig) {
      this.pool = new Pool({
        host: databaseConfig.host,
        port: databaseConfig.port,
        database: databaseConfig.database,
        user: databaseConfig.username,
        password: databaseConfig.password,
        ssl: databaseConfig.ssl,
        max: 10,
        min: 1,
        idleTimeoutMillis: 30000,
      });
    }
  }

  /**
   * Start the queue producer
   */
  async start(): Promise<void> {
    try {
      await this.pgBoss.start();
      this.isConnected = true;
      
      // Create the messages queue if it doesn't exist
      await this.pgBoss.createQueue('messages');
      logger.info("✅ Created/verified messages queue");
      
      logger.info("✅ Queue producer started successfully");
    } catch (error) {
      logger.error("Failed to start queue producer:", error);
      throw error;
    }
  }

  /**
   * Stop the queue producer
   */
  async stop(): Promise<void> {
    try {
      this.isConnected = false;
      await this.pgBoss.stop();
      if (this.pool) {
        await this.pool.end();
      }
      logger.info("✅ Queue producer stopped");
    } catch (error) {
      logger.error("Error stopping queue producer:", error);
      throw error;
    }
  }

  /**
   * Enqueue any message (direct or thread) to the single 'messages' queue
   * Orchestrator will determine if it needs to create a deployment or route to existing thread
   */
  async enqueueMessage(
    payload: WorkerDeploymentPayload | ThreadMessagePayload,
    options?: {
      priority?: number;
      retryLimit?: number;
      retryDelay?: number;
      expireInSeconds?: number;
    }
  ): Promise<string> {
    if (!this.isConnected) {
      throw new Error("Queue producer is not connected");
    }

    try {
      // All messages go to the single 'messages' queue
      const jobId = await this.pgBoss.send('messages', payload, {
        priority: options?.priority || 0,
        retryLimit: options?.retryLimit || 3,
        retryDelay: options?.retryDelay || 30,
        expireInSeconds: options?.expireInSeconds || 300, // 5 minutes = 300 seconds
        singletonKey: `message-${payload.userId}-${payload.threadId}-${payload.messageId || Date.now()}`, // Prevent duplicates
      });

      // Debug: Check what send() actually returns
      logger.info(`pgBoss.send() returned: ${JSON.stringify(jobId)}, type: ${typeof jobId}`);
      logger.info(`Enqueued message job ${jobId} for user ${payload.userId}, thread ${payload.threadId}`);
      return jobId || 'job-sent';

    } catch (error) {
      Sentry.captureException(error);
      logger.error(`Failed to enqueue message for user ${payload.userId}:`, error);
      throw error;
    }
  }

  /**
   * Enqueue a worker deployment request (for new conversations/threads)
   * @deprecated Use enqueueMessage instead
   */
  async enqueueWorkerDeployment(
    payload: WorkerDeploymentPayload,
    options?: {
      priority?: number;
      retryLimit?: number;
      retryDelay?: number;
      expireInSeconds?: number;
    }
  ): Promise<string> {
    return this.enqueueMessage(payload, options);
  }

  /**
   * Enqueue a thread message job
   * @deprecated Use enqueueMessage instead
   */
  async enqueueThreadMessage(
    payload: ThreadMessagePayload,
    options?: {
      priority?: number;
      retryLimit?: number;
      retryDelay?: number;
      expireInSeconds?: number;
    }
  ): Promise<string> {
    return this.enqueueMessage(payload, options);
  }


  /**
   * Execute a query with user context for RLS
   */
  async queryWithUserContext<T>(
    userId: string,
    query: string,
    params?: any[]
  ): Promise<{ rows: T[]; rowCount: number }> {
    if (!this.pool) {
      throw new Error("Database pool not available - queue producer not configured with database config");
    }

    const client = await this.pool.connect();
    
    try {
      // Set user context for RLS policies using PostgreSQL session configuration
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
      
      const result = await client.query(query, params);
      return {
        rows: result.rows,
        rowCount: result.rowCount || 0
      };
    } finally {
      client.release();
    }
  }

  /**
   * Update job status using the database function
   */
  async updateJobStatus(
    jobId: string,
    status: 'pending' | 'active' | 'completed' | 'failed',
    retryCount?: number
  ): Promise<void> {
    if (!this.pool) {
      logger.warn(`Cannot update job status for ${jobId} - database pool not available`);
      return;
    }

    try {
      const query = 'SELECT update_job_status($1, $2, $3)';
      const params = [jobId, status, retryCount || null];
      
      await this.pool.query(query, params);
      logger.debug(`Updated job ${jobId} status to: ${status}`);
    } catch (error) {
      logger.error(`Failed to update job status for ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    try {
      const stats = await this.pgBoss.getQueueSize(queueName);
      return {
        waiting: typeof stats === 'number' ? stats : 0,
        active: 0, // PgBoss.getQueueSize only returns waiting count
        completed: 0,
        failed: 0
      };
    } catch (error) {
      logger.error(`Failed to get queue stats for ${queueName}:`, error);
      return { waiting: 0, active: 0, completed: 0, failed: 0 };
    }
  }



  /**
   * Check if producer is connected
   */
  isHealthy(): boolean {
    return this.isConnected;
  }
}