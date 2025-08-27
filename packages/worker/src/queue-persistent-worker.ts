#!/usr/bin/env bun

// Set TLS verification before any imports that might use HTTPS
if (process.env.K8S_SKIP_TLS_VERIFY === "true") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import { ClaudeWorker } from "./claude-worker";
import { WorkerQueueConsumer } from "./queue/queue-consumer";
import type { WorkerConfig } from "./types";
import logger from "./logger";

/**
 * Queue-based persistent Claude worker
 * Replaces ConfigMap polling with PostgreSQL queue consumption
 */
export class QueuePersistentClaudeWorker {
  private worker: ClaudeWorker | null = null;
  // @ts-ignore - Config loaded but not currently used
  private config!: WorkerConfig;
  private queueConsumer: WorkerQueueConsumer;
  private userId: string;
  private targetThreadId?: string;
  private isInitialized = false;

  constructor(userId: string, targetThreadId?: string) {
    this.userId = userId;
    this.targetThreadId = targetThreadId;
    
    // Load initial configuration from environment
    // this.config = this.loadConfigFromEnv();
    
    // Get deployment name from environment
    const deploymentName = process.env.DEPLOYMENT_NAME;
    if (!deploymentName) {
      throw new Error('DEPLOYMENT_NAME environment variable is required');
    }
    
    // Initialize queue consumer with thread-specific routing
    const connectionString = this.buildConnectionString();
    this.queueConsumer = new WorkerQueueConsumer(
      connectionString,
      this.userId,
      deploymentName,
      this.targetThreadId
    );
    
    logger.info(`🚀 Starting Queue-based Persistent Claude Worker`);
    logger.info(`- User ID: ${this.userId}`);
    logger.info(`- Deployment: ${deploymentName}`);
    if (this.targetThreadId) {
      logger.info(`- Target Thread: ${this.targetThreadId}`);
    }
  }

  private buildConnectionString(): string {
    // Use DATABASE_URL from environment
    const connectionString = process.env.DATABASE_URL;
    if (connectionString) {
      return connectionString;
    }
    
    // Fallback to building from individual components
    const host = process.env.DATABASE_HOST || "localhost";
    const port = process.env.DATABASE_PORT || "5432";
    const database = process.env.DATABASE_NAME || "peerbot";
    const username = encodeURIComponent(process.env.DATABASE_USER || "postgres");
    const password = encodeURIComponent(process.env.DATABASE_PASSWORD || "");

    return `postgres://${username}:${password}@${host}:${port}/${database}`;
  }


  async start(): Promise<void> {
    try {
      // Start queue consumer (this will handle message processing)
      await this.queueConsumer.start();
  
      
      this.isInitialized = true;
      logger.info(`✅ Queue-based persistent worker started successfully`);
      
    } catch (error) {
      logger.error("Failed to start queue-based persistent worker:", error);
      process.exit(1);
    }
  }

  /**
   * Stop the worker (public method)
   */
  async stop(): Promise<void> {
    await this.shutdown();
  }

  /**
   * Graceful shutdown
   */
  private async shutdown(): Promise<void> {
    logger.info(`Shutting down queue-based persistent worker...`);
    
    try {
      // Stop queue consumer
      await this.queueConsumer.stop();
      
      // Cleanup current worker if processing
      if (this.worker) {
        await this.worker.cleanup();
      }
      
    } catch (error) {
      logger.error("Error during shutdown:", error);
    }
    
    process.exit(0);
  }

  /**
   * Get worker status
   */
  getStatus(): {
    isInitialized: boolean;
    queueStatus: any;
  } {
    return {
      isInitialized: this.isInitialized,
      queueStatus: this.queueConsumer.getStatus(),
    };
  }
}

/**
 * Main entry point for queue-based persistent worker
 * @internal
 */
// @ts-ignore - Called from index.ts when WORKER_MODE is 'queue'
async function main() {
  try {
    // Get user ID from environment - required for worker
    const userId = process.env.USER_ID;
    const targetThreadId = process.env.TARGET_THREAD_ID; // Optional
    
    if (!userId) {
      logger.error("❌ USER_ID environment variable is required");
      process.exit(1);
    }
    
    const persistentWorker = new QueuePersistentClaudeWorker(userId, targetThreadId);
    await persistentWorker.start();
    
    // Setup graceful shutdown
    process.on("SIGTERM", async () => {
      logger.info("Received SIGTERM, shutting down gracefully...");
      await persistentWorker.stop();
      process.exit(0);
    });

    process.on("SIGINT", async () => {
      logger.info("Received SIGINT, shutting down gracefully...");
      await persistentWorker.stop();
      process.exit(0);
    });
    
    // Keep the process running
    await new Promise(() => {}); // Run forever
    
  } catch (error) {
    logger.error("❌ Queue-based persistent worker failed:", error);
    process.exit(1);
  }
}

// Only start if this file is run directly
// Note: import.meta.main is not supported in TypeScript with current config
// The main() function is called from index.ts instead