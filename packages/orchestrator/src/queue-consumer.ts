import * as Sentry from "@sentry/node";
import PgBoss from 'pg-boss';
import * as k8s from '@kubernetes/client-node';
import { 
  OrchestratorConfig, 
  WorkerDeploymentRequest, 
  OrchestratorError,
  ErrorCode 
} from './types';
import { DeploymentManager } from './deployment-manager';

export class QueueConsumer {
  private pgBoss: PgBoss;
  private deploymentManager: DeploymentManager;
  private config: OrchestratorConfig;
  private isRunning = false;

  constructor(config: OrchestratorConfig, deploymentManager: DeploymentManager) {
    this.config = config;
    this.deploymentManager = deploymentManager;
    
    this.pgBoss = new PgBoss({
      connectionString: config.queues.connectionString,
      retryLimit: config.queues.retryLimit,
      retryDelay: config.queues.retryDelay,
      expireInSeconds: config.queues.expireInSeconds,
      retentionDays: 7,
      deleteAfterDays: 30,
      monitorStateIntervalSeconds: 60,
      maintenanceIntervalSeconds: 30,
      supervise: true  // Explicitly enable maintenance and monitoring
    });
  }

  async start(): Promise<void> {
    try {
      await this.pgBoss.start();
      this.isRunning = true;

      // Set up pgboss RLS policies now that pgboss has initialized
      try {
        const pool = (this.pgBoss as any).pool;
        if (pool) {
          const client = await pool.connect();
          try {
            await client.query('SELECT setup_pgboss_rls_on_demand()');
            console.log('✅ pgboss RLS policies configured');
          } finally {
            client.release();
          }
        }
      } catch (error) {
        console.warn('⚠️  Failed to setup pgboss RLS:', error instanceof Error ? error.message : String(error));
      }

      // Create the messages queue if it doesn't exist
      await this.pgBoss.createQueue('messages');
      console.log('✅ Created/verified messages queue');

      // Subscribe to the single messages queue for all messages
      await this.pgBoss.work('messages', async (job) => {
        return await Sentry.startSpan(
          { 
            name: "orchestrator.process_queue_job", 
            op: "orchestrator.queue_processing",
            attributes: {
              "job.id": job?.id || "unknown"
            }
          },
          async () => {
            console.log('=== PG-BOSS JOB RECEIVED ===');
            console.log('Raw job:', JSON.stringify(job, null, 2));
            return this.handleMessage(job);
          }
        );
      });

      console.log('✅ Queue consumer started - listening for messages');

      // Start background cleanup task
      this.startCleanupTask();

    } catch (error) {
      throw new OrchestratorError(
        ErrorCode.QUEUE_JOB_PROCESSING_FAILED,
        `Failed to start queue consumer: ${error instanceof Error ? error.message : String(error)}`,
        { error },
        true
      );
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    await this.pgBoss.stop();
    console.log('✅ Queue consumer stopped');
  }

  /**
   * Handle all messages - creates deployment for new threads or routes to existing thread queues
   */
  private async handleMessage(job: any): Promise<void> {
    console.log('=== ORCHESTRATOR RECEIVED JOB ===');
    
    // pgBoss passes job as array sometimes, get the first item
    const actualJob = Array.isArray(job) ? job[0] : job;
    const data = actualJob?.data || actualJob;
    const jobId = actualJob?.id || 'unknown';
    
    console.log('Processing job:', jobId);
    console.log('Job data:', JSON.stringify(data, null, 2));
    
    console.log(`Processing message job ${jobId} for user ${data?.userId}, thread ${data?.threadId}`);

    try {
      const deploymentName = `peerbot-worker-${data.threadId}`;
      const isNewThread = !data.routingMetadata?.targetThreadId; // New thread if no parent thread
      const teamId = data.platformMetadata?.teamId;
      
      if (isNewThread) {
        // New thread - create deployment
        console.log(`New thread ${data.threadId} - creating deployment ${deploymentName}`);
        
        await Sentry.startSpan(
          { 
            name: "orchestrator.create_worker_deployment", 
            op: "orchestrator.deployment_management",
            attributes: {
              "user.id": data.userId,
              "thread.id": data.threadId,
              "deployment.name": deploymentName
            }
          },
          async () => {
            await this.deploymentManager.createWorkerDeployment(data.userId, data.threadId, teamId, data);
          }
        );
        console.log(`✅ Created deployment: ${deploymentName}`);

        // Enforce deployment limit after creating new deployment
        await this.deploymentManager.enforceMaxDeploymentLimit();

      } else {
        // Existing thread - ensure deployment is scaled to 1
        console.log(`Existing thread ${data.threadId} - ensuring deployment ${deploymentName} is running`);
        
        try {
          await this.deploymentManager.scaleDeployment(deploymentName, 1);
          console.log(`✅ Scaled deployment ${deploymentName} to 1`);
        } catch (error) {
          // Deployment doesn't exist, recreate it
          console.log(`Deployment ${deploymentName} doesn't exist, recreating...`);
          await this.deploymentManager.createWorkerDeployment(data.userId, data.threadId, teamId, data);
          console.log(`✅ Recreated deployment: ${deploymentName}`);

          // Enforce deployment limit after recreating deployment
          await this.deploymentManager.enforceMaxDeploymentLimit();
        }
      }

      // Send message to worker queue
      await Sentry.startSpan(
        { 
          name: "orchestrator.send_to_worker_queue", 
          op: "orchestrator.message_routing",
          attributes: {
            "user.id": data.userId,
            "thread.id": data.threadId,
            "deployment.name": deploymentName
          }
        },
        async () => {
          await this.sendToWorkerQueue(data, deploymentName);
        }
      );

      console.log(`✅ Message job ${jobId} completed successfully`);
      
    } catch (error) {
      Sentry.captureException(error);
      console.error(`❌ Message job ${jobId} failed:`, error);

      // Re-throw for pgboss retry handling
      throw new OrchestratorError(
        ErrorCode.QUEUE_JOB_PROCESSING_FAILED,
        `Failed to process message job: ${error instanceof Error ? error.message : String(error)}`,
        { jobId, data, error },
        true
      );
    }
  }

  /**
   * Send message to worker queue for the worker to consume
   */
  private async sendToWorkerQueue(data: any, deploymentName: string): Promise<void> {
    try {
      // Create thread-specific queue name: thread_message_[deploymentid]
      const threadQueueName = `thread_message_${deploymentName}`;
      
      console.log(`🚀 [DEBUG] About to send message to thread queue: ${threadQueueName}`);
      console.log(`🚀 [DEBUG] Message data:`, JSON.stringify({
        userId: data.userId,
        threadId: data.threadId,
        messageText: data.messageText
      }, null, 2));
      
      // Create the thread-specific queue if it doesn't exist
      console.log(`🚀 [DEBUG] Creating/verifying thread queue: ${threadQueueName}`);
      await this.pgBoss.createQueue(threadQueueName);
      console.log(`✅ [DEBUG] Thread queue created/verified: ${threadQueueName}`);
      
      // Send message to thread-specific queue
      const jobId = await this.pgBoss.send(threadQueueName, {
        ...data,
        // Add routing metadata
        routingMetadata: {
          deploymentName,
          threadId: data.threadId,
          userId: data.userId,
          timestamp: new Date().toISOString()
        }
      }, {
        expireInSeconds: this.config.queues.expireInSeconds,
        retryLimit: this.config.queues.retryLimit,
        retryDelay: this.config.queues.retryDelay,
        priority: 10 // Thread messages have high priority
      });

      console.log(`🚀 [DEBUG] pgBoss.send() returned: ${JSON.stringify(jobId)} (type: ${typeof jobId})`);
      
      if (!jobId) {
        throw new Error(`pgBoss.send() returned null/undefined for queue: ${threadQueueName}`);
      }

      console.log(`✅ Sent message to thread queue ${threadQueueName} for thread ${data.threadId}, jobId: ${jobId}`);
    } catch (error) {
      console.error(`❌ [ERROR] sendToWorkerQueue failed:`, error);
      throw new OrchestratorError(
        ErrorCode.QUEUE_JOB_PROCESSING_FAILED,
        `Failed to send message to thread queue: ${error instanceof Error ? error.message : String(error)}`,
        { deploymentName, data, error },
        true
      );
    }
  }




  /**
   * Start background cleanup task for inactive threads
   */
  private startCleanupTask(): void {
    const cleanupInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(cleanupInterval);
        return;
      }

      console.log('🧹 Running worker deployment cleanup task...');
      try {
        await this.cleanupIdleWorkerDeployments();
      } catch (error) {
        console.error('Error during cleanup task:', error);
      }
    }, 60 * 1000); // Run every minute
  }

  /**
   * Clean up idle worker deployments
   */
  private async cleanupIdleWorkerDeployments(): Promise<void> {
    try {
      // Get all worker deployments
      const kc = new k8s.KubeConfig();
      kc.loadFromDefault();
      const k8sApi = kc.makeApiClient(k8s.AppsV1Api);
      const response = await k8sApi.listNamespacedDeployment(
        'peerbot',
        undefined,
        undefined,
        undefined,
        undefined,
        'app.kubernetes.io/component=worker'
      );
      const body = response.body;

      const now = Date.now();
      const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

      for (const deployment of body.items) {
        if (!deployment.metadata?.name?.startsWith('peerbot-worker-')) {
          continue;
        }

        // Check deployment age
        const creationTime = new Date(deployment.metadata.creationTimestamp!).getTime();
        const ageMs = now - creationTime;

        // Check if deployment has been idle for too long OR has ttl annotation for immediate cleanup
        const shouldCleanup = ageMs > IDLE_TIMEOUT_MS || 
                             deployment.metadata?.annotations?.['peerbot/cleanup'] === 'true';

        if (shouldCleanup) {
          // Check if deployment is actually idle by looking at pod status
          const isIdle = await this.isWorkerDeploymentIdle(deployment.metadata.name);
          
          if (isIdle) {
            console.log(`🗑️  Cleaning up idle worker deployment: ${deployment.metadata.name} (age: ${Math.round(ageMs / 60000)}m)`);
            
            try {
              await k8sApi.deleteNamespacedDeployment(
                deployment.metadata.name,
                'peerbot'
              );
              console.log(`✅ Successfully cleaned up deployment: ${deployment.metadata.name}`);
            } catch (deleteError) {
              console.error(`❌ Failed to delete deployment ${deployment.metadata.name}:`, deleteError);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error during worker deployment cleanup:', error);
    }
  }

  /**
   * Check if a worker deployment is idle
   */
  private async isWorkerDeploymentIdle(deploymentName: string): Promise<boolean> {
    try {
      const kc = new k8s.KubeConfig();
      kc.loadFromDefault();
      const coreApi = kc.makeApiClient(k8s.CoreV1Api);
      const response = await coreApi.listNamespacedPod(
        'peerbot',
        undefined,
        undefined,
        undefined,
        undefined,
        `app=${deploymentName}`
      );
      const pods = response.body;

      // If no pods exist, deployment is idle
      if (pods.items.length === 0) {
        return true;
      }

      // Check pod status - if all pods are not running or failing, consider idle
      const runningPods = pods.items.filter((pod: k8s.V1Pod) => 
        pod.status?.phase === 'Running' && 
        pod.status?.containerStatuses?.every((c: k8s.V1ContainerStatus) => c.ready)
      );

      // If no healthy running pods, deployment is idle
      if (runningPods.length === 0) {
        return true;
      }

      // Additional check: look at container restarts - high restart count might indicate problems
      const hasHighRestarts = pods.items.some((pod: k8s.V1Pod) =>
        pod.status?.containerStatuses?.some((c: k8s.V1ContainerStatus) => (c.restartCount || 0) > 3)
      );

      return hasHighRestarts;
    } catch (error) {
      console.error(`Error checking if deployment ${deploymentName} is idle:`, error);
      // If we can't check, assume it's not idle (safer)
      return false;
    }
  }


  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<any> {
    try {
      const stats = await this.pgBoss.getQueueSize('messages');
      return {
        messages: stats,
        isRunning: this.isRunning
      };
    } catch (error) {
      console.error('Failed to get queue stats:', error);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
}