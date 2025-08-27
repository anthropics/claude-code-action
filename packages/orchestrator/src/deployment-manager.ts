import * as k8s from '@kubernetes/client-node';
import { 
  OrchestratorConfig, 
  SimpleDeployment, 
  OrchestratorError,
  ErrorCode 
} from './types';
import { DatabasePool } from './database-pool';

export class DeploymentManager {
  private appsV1Api: k8s.AppsV1Api;
  private coreV1Api: k8s.CoreV1Api;
  private config: OrchestratorConfig;
  private dbPool: DatabasePool;

  constructor(config: OrchestratorConfig, dbPool: DatabasePool) {
    this.config = config;
    this.dbPool = dbPool;

    const kc = new k8s.KubeConfig();
    try {
      // Try in-cluster config first, then fall back to default
      if (process.env.KUBERNETES_SERVICE_HOST) {
        try {
          kc.loadFromCluster();
          console.log('✅ Loaded in-cluster Kubernetes config');
        } catch (clusterError) {
          console.log('⚠️  In-cluster config failed, trying default config');
          kc.loadFromDefault();
          console.log('✅ Loaded default Kubernetes config as fallback');
        }
      } else {
        kc.loadFromDefault();
        console.log('✅ Loaded default Kubernetes config');
      }
      
      // For development environments, disable TLS verification to avoid certificate issues
      if (process.env.NODE_ENV === 'development' || 
          process.env.KUBERNETES_SERVICE_HOST?.includes('127.0.0.1') ||
          process.env.KUBERNETES_SERVICE_HOST?.includes('192.168') ||
          process.env.KUBERNETES_SERVICE_HOST?.includes('localhost')) {
        const cluster = kc.getCurrentCluster();
        if (cluster && cluster.skipTLSVerify !== true) {
          console.log('🔧 Development environment detected, disabling TLS verification');
          (cluster as any).skipTLSVerify = true;
        }
      }
      
    } catch (error) {
      console.error('❌ Failed to load Kubernetes config:', error);
      throw new OrchestratorError(
        ErrorCode.DEPLOYMENT_CREATE_FAILED,
        `Failed to initialize Kubernetes client: ${error instanceof Error ? error.message : String(error)}`,
        { error },
        true
      );
    }
    
    this.appsV1Api = kc.makeApiClient(k8s.AppsV1Api);
    this.coreV1Api = kc.makeApiClient(k8s.CoreV1Api);
  }




  /**
   * Generate PostgreSQL username from user ID (one user per Slack user)
   */
  private generatePostgresUsername(userId: string, teamId?: string, threadId?: string): string {
    // Create one PostgreSQL user per Slack user ID
    const username = userId.toLowerCase().substring(0, 63); // PostgreSQL max username length
    return username;
  }

  /**
   * Generate random password for PostgreSQL user (URL-safe characters only)
   */
  private generateRandomPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 32; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /**
   * Create PostgreSQL user with isolated access to pgboss using RLS system
   */
  private async createPostgresUser(username: string, password: string): Promise<void> {
    const client = await this.dbPool.getClient();
    
    try {
      console.log(`Creating isolated pgboss user: ${username}`);
      
      // Use the RLS-aware user creation function with just the username and password
      const createdUsername = await client.query(
        'SELECT create_isolated_pgboss_user($1, $2) as username',
        [username, password]
      );
      
      const actualUsername = createdUsername.rows[0]?.username;
      if (actualUsername !== username) {
        console.warn(`Username mismatch: expected ${username}, got ${actualUsername}`);
      }
      
      console.log(`✅ Successfully ensured user ${username} has isolated pgboss access`);
      
    } catch (error) {
      console.error(`Failed to create/update PostgreSQL user ${username}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get existing password from secret or create new user credentials
   */
  private async getOrCreateUserCredentials(username: string): Promise<string> {
    const secretName = `peerbot-user-secret-${username.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
    
    try {
      // Try to read existing secret first
      const existingSecret = await this.coreV1Api.readNamespacedSecret(secretName, this.config.kubernetes.namespace);
      const existingPassword = Buffer.from(existingSecret.body.data?.['DB_PASSWORD'] || '', 'base64').toString();
      
      if (existingPassword) {
        console.log(`Found existing secret for user ${username}, using existing credentials`);
        return existingPassword;
      }
    } catch (error) {
      // Secret doesn't exist, will create new credentials
      console.log(`Secret ${secretName} does not exist, creating new credentials`);
    }
    
    // Generate new credentials
    const password = this.generateRandomPassword();
    console.log(`Creating new credentials for user ${username}`);
    await this.createPostgresUser(username, password);
    await this.createUserSecret(username, password);
    return password;
  }

  /**
   * Update existing Kubernetes secret with new PostgreSQL credentials
   */
  private async updateUserSecret(secretName: string, username: string, password: string): Promise<void> {
    try {
      const secretData = {
        'DATABASE_URL': Buffer.from(`postgres://${username}:${password}@peerbot-postgresql:5432/peerbot`).toString('base64'),
        'DB_USERNAME': Buffer.from(username).toString('base64'),
        'DB_PASSWORD': Buffer.from(password).toString('base64')
      };

      const secretPatch = {
        data: secretData
      };

      await this.coreV1Api.patchNamespacedSecret(secretName, this.config.kubernetes.namespace, secretPatch);
      console.log(`✅ Updated secret: ${secretName}`);
    } catch (error) {
      throw new OrchestratorError(
        ErrorCode.DEPLOYMENT_CREATE_FAILED,
        `Failed to update user secret: ${error instanceof Error ? error.message : String(error)}`,
        { username, secretName, error },
        true
      );
    }
  }

  /**
   * Create Kubernetes secret with PostgreSQL credentials
   */
  private async createUserSecret(username: string, password: string): Promise<void> {
    const secretName = `peerbot-user-secret-${username.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
    
    try {
      // Check if secret already exists
      try {
        await this.coreV1Api.readNamespacedSecret(secretName, this.config.kubernetes.namespace);
        console.log(`Secret ${secretName} already exists`);
        return;
      } catch (error) {
        // Secret doesn't exist, create it
      }

      const secretData = {
        'DATABASE_URL': Buffer.from(`postgres://${username}:${password}@peerbot-postgresql:5432/peerbot`).toString('base64'),
        'DB_USERNAME': Buffer.from(username).toString('base64'),
        'DB_PASSWORD': Buffer.from(password).toString('base64')
      };

      const secret = {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
          name: secretName,
          namespace: this.config.kubernetes.namespace,
          labels: {
            'app.kubernetes.io/name': 'peerbot',
            'app.kubernetes.io/component': 'worker',
            'peerbot/managed-by': 'orchestrator'
          }
        },
        type: 'Opaque',
        data: secretData
      };

      await this.coreV1Api.createNamespacedSecret(this.config.kubernetes.namespace, secret);
      console.log(`✅ Created secret: ${secretName}`);
    } catch (error) {
      throw new OrchestratorError(
        ErrorCode.DEPLOYMENT_CREATE_FAILED,
        `Failed to create user secret: ${error instanceof Error ? error.message : String(error)}`,
        { username, secretName, error },
        true
      );
    }
  }

  /**
   * Create worker deployment for handling messages
   */
  async createWorkerDeployment(userId: string, threadId: string, teamId?: string, messageData?: any): Promise<void> {
    const deploymentName = `peerbot-worker-${threadId}`;
    
    try {
      // Always ensure user credentials exist first
      const username = this.generatePostgresUsername(userId, teamId, threadId);
      
      console.log(`Ensuring PostgreSQL user and secret for ${username}...`);
      
      // Check if secret already exists and get existing password, or generate new one
      await this.getOrCreateUserCredentials(username);

      // Check if deployment already exists
      try {
        await this.appsV1Api.readNamespacedDeployment(deploymentName, this.config.kubernetes.namespace);
        console.log(`Deployment ${deploymentName} already exists, scaling to 1`);
        await this.scaleDeployment(deploymentName, 1);
        return;
      } catch (error) {
        // Deployment doesn't exist, create it
      }

      console.log(`Creating deployment ${deploymentName}...`);
      await this.createSimpleWorkerDeployment(deploymentName, username, userId, messageData);
      console.log(`✅ Successfully created deployment ${deploymentName}`);
      
    } catch (error) {
      throw new OrchestratorError(
        ErrorCode.DEPLOYMENT_CREATE_FAILED,
        `Failed to create worker deployment: ${error instanceof Error ? error.message : String(error)}`,
        { userId, threadId, error },
        true
      );
    }
  }

  /**
   * Create a simple worker deployment
   */
  private async createSimpleWorkerDeployment(deploymentName: string, username: string, userId: string, messageData?: any): Promise<void> {
    const deployment: SimpleDeployment = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: deploymentName,
        namespace: this.config.kubernetes.namespace,
        labels: {
          'app.kubernetes.io/name': 'peerbot',
          'app.kubernetes.io/component': 'worker',
          'peerbot/managed-by': 'orchestrator'
        }
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: {
            'app.kubernetes.io/name': 'peerbot',
            'app.kubernetes.io/component': 'worker'
          }
        },
        template: {
          metadata: {
            annotations: {
              // Add Slack thread link for visibility
              ...(messageData?.channelId && messageData?.threadId ? {
                'thread_url': `https://app.slack.com/client/${messageData?.platformMetadata?.teamId || 'unknown'}/${messageData.channelId}/thread/${messageData.threadId}`
              } : {}),
              // Add Slack user profile link
              ...(messageData?.platformUserId && messageData?.platformMetadata?.teamId ? {
                'user_url': `https://app.slack.com/team/${messageData.platformMetadata.teamId}/${messageData.platformUserId}`
              } : {}),
              'peerbot.io/created': new Date().toISOString()
            },
            labels: {
              'app.kubernetes.io/name': 'peerbot',
              'app.kubernetes.io/component': 'worker'
            }
          },
          spec: {
            serviceAccountName: 'peerbot-worker',
            containers: [{
              name: 'worker',
              image: `${this.config.worker.image.repository}:${this.config.worker.image.tag}`,
              imagePullPolicy: 'IfNotPresent',
              env: [
                // User-specific database connection from secret
                {
                  name: 'DATABASE_URL',
                  valueFrom: {
                    secretKeyRef: {
                      name: `peerbot-user-secret-${username.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`,
                      key: 'DATABASE_URL'
                    }
                  }
                },
                // Worker configuration
                {
                  name: 'WORKER_MODE',
                  value: 'queue'
                },
                {
                  name: 'USER_ID',
                  value: userId
                },
                {
                  name: 'DEPLOYMENT_NAME',
                  value: deploymentName
                },
                {
                  name: 'SESSION_KEY', 
                  value: messageData?.agentSessionId || `session-${userId}-${Date.now()}`
                },
                {
                  name: 'CHANNEL_ID',
                  value: messageData?.channelId || 'unknown-channel'
                },
                {
                  name: 'REPOSITORY_URL',
                  value: messageData?.platformMetadata?.repositoryUrl || process.env.GITHUB_REPOSITORY || 'https://github.com/anthropics/claude-code-examples'
                },
                {
                  name: 'ORIGINAL_MESSAGE_TS',
                  value: messageData?.platformMetadata?.originalMessageTs || messageData?.messageId || 'unknown'
                },
                {
                  name: 'GITHUB_TOKEN',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'peerbot-secrets',
                      key: 'github-token'
                    }
                  }
                },
                // TODO: Add support for Anthropic API key env available only if the k8s secret has that value. 
                {
                  name: 'CLAUDE_CODE_OAUTH_TOKEN',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'peerbot-secrets',
                      key: 'claude-code-oauth-token'
                    }
                  }
                },
                {
                  name: 'LOG_LEVEL',
                  value: 'info'
                },
                // Workspace configuration
                {
                  name: 'WORKSPACE_PATH',
                  value: '/workspace'
                },
                // Slack thread information for visibility and tooling
                {
                  name: 'SLACK_TEAM_ID',
                  value: messageData?.platformMetadata?.teamId || ''
                },
                {
                  name: 'SLACK_CHANNEL_ID', 
                  value: messageData?.channelId || ''
                },
                {
                  name: 'SLACK_THREAD_TS',
                  value: messageData?.threadId || ''
                },
                // Security: Claude tool restrictions (only if env vars exist)
                ...(process.env.CLAUDE_ALLOWED_TOOLS ? [{
                  name: 'CLAUDE_ALLOWED_TOOLS',
                  value: process.env.CLAUDE_ALLOWED_TOOLS
                }] : []),
                ...(process.env.CLAUDE_DISALLOWED_TOOLS ? [{
                  name: 'CLAUDE_DISALLOWED_TOOLS',
                  value: process.env.CLAUDE_DISALLOWED_TOOLS
                }] : []),
                ...(process.env.CLAUDE_TIMEOUT_MINUTES ? [{
                  name: 'CLAUDE_TIMEOUT_MINUTES',
                  value: process.env.CLAUDE_TIMEOUT_MINUTES
                }] : []),
                // Worker environment variables from configuration
                ...Object.entries(this.config.worker.env || {}).map(([key, value]) => ({
                  name: key,
                  value: String(value)
                }))
              ],
              resources: {
                requests: this.config.worker.resources.requests,
                limits: this.config.worker.resources.limits
              },
              volumeMounts: [{
                name: 'workspace',
                mountPath: '/workspace'
              }]
            }],
            volumes: [{
              name: 'workspace',
              emptyDir: {}
            }]
          }
        }
      }
    };

    await this.appsV1Api.createNamespacedDeployment(this.config.kubernetes.namespace, deployment);
  }



  /**
   * Scale deployment to specified replica count
   */
  async scaleDeployment(deploymentName: string, replicas: number): Promise<void> {
    try {
      const deployment = await this.appsV1Api.readNamespacedDeployment(
        deploymentName,
        this.config.kubernetes.namespace
      );
      
      if (deployment.body.spec?.replicas !== replicas) {
        deployment.body.spec!.replicas = replicas;
        await this.appsV1Api.patchNamespacedDeployment(
          deploymentName,
          this.config.kubernetes.namespace,
          deployment.body
        );
        console.log(`Scaled deployment ${deploymentName} to ${replicas} replicas`);
      }
    } catch (error) {
      throw new OrchestratorError(
        ErrorCode.DEPLOYMENT_SCALE_FAILED,
        `Failed to scale deployment ${deploymentName}: ${error instanceof Error ? error.message : String(error)}`,
        { deploymentName, replicas, error },
        true
      );
    }
  }

  /**
   * Enforce maximum deployment limit by removing oldest inactive deployments (FIXED VERSION)
   */
  async enforceMaxDeploymentLimit(): Promise<void> {
    try {
      const maxDeployments = this.config.worker.maxDeployments || 10;
      
      // Get actual deployments from Kubernetes (not just database records)
      const k8sDeployments = await this.appsV1Api.listNamespacedDeployment(
        this.config.kubernetes.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        'app.kubernetes.io/component=worker'
      );

      const activeDeployments = k8sDeployments.body.items || [];
      console.log(`📊 Found ${activeDeployments.length} actual worker deployments in Kubernetes`);
      
      if (activeDeployments.length <= maxDeployments) {
        console.log(`✅ Current deployments (${activeDeployments.length}) within limit (${maxDeployments})`);
        return;
      }

      // Get deployment activity from database to determine which to delete
      const client = await this.dbPool.getClient();
      let deploymentActivity: Map<string, Date>;
      try {
        const activityQuery = `
          SELECT DISTINCT 
            data->>'threadId' as thread_id,
            MAX(created_on) as last_activity
          FROM pgboss.job
          WHERE name LIKE 'thread_message_%'
            AND created_on > NOW() - INTERVAL '24 hours'
          GROUP BY data->>'threadId'
        `;
        const result = await client.query(activityQuery);
        deploymentActivity = new Map(
          result.rows.map(row => [row.thread_id, new Date(row.last_activity)])
        );
      } finally {
        client.release();
      }

      // Sort deployments by last activity (oldest first) or creation time if no activity
      const deploymentsWithActivity = activeDeployments.map((deployment: any) => {
        const deploymentName = deployment.metadata?.name || '';
        const threadId = deploymentName.replace('peerbot-worker-', '');
        const lastActivity = deploymentActivity.get(threadId);
        const creationTime = deployment.metadata?.creationTimestamp ? 
          new Date(deployment.metadata.creationTimestamp) : new Date();
        
        return {
          deployment,
          threadId,
          lastActivity: lastActivity || creationTime,
          deploymentName
        };
      }).sort((a: any, b: any) => a.lastActivity.getTime() - b.lastActivity.getTime());

      const excessCount = activeDeployments.length - maxDeployments;
      const deploymentsToDelete = deploymentsWithActivity.slice(0, excessCount);
      
      console.log(`🧹 Need to remove ${excessCount} excess deployments (current: ${activeDeployments.length}, max: ${maxDeployments})`);
      
      let actuallyDeleted = 0;
      for (const { deploymentName, lastActivity } of deploymentsToDelete) {
        console.log(`🧹 Removing excess deployment: ${deploymentName} (last activity: ${lastActivity.toISOString()})`);
        
        try {
          await this.appsV1Api.deleteNamespacedDeployment(
            deploymentName,
            this.config.kubernetes.namespace
          );
          actuallyDeleted++;
          console.log(`✅ Successfully deleted deployment: ${deploymentName}`);
        } catch (error: any) {
          if (error.statusCode === 404) {
            console.log(`⚠️  Deployment ${deploymentName} not found (already deleted)`);
          } else {
            console.error(`Failed to delete deployment ${deploymentName}:`, error);
          }
        }
      }
      
      if (actuallyDeleted > 0) {
        console.log(`🧹 Idle deployment cleanup completed. Cleaned up ${actuallyDeleted} deployments.`);
      }
    } catch (error) {
      console.error('Failed to enforce deployment limit:', error);
    }
  }

  /**
   * Find idle deployments from the database
   */
  async findIdleDeployments(): Promise<Array<{
    deploymentId: string;
    userId: string;
    lastActivity: Date;
    minutesIdle: number;
    messageCount: number;
  }>> {
    const client = await this.dbPool.getClient();
    try {
      const query = `
        WITH deployment_last_activity AS (
          SELECT 
            COALESCE(
              SUBSTRING(data->>'gitBranch' FROM 'claude/session-([0-9.-]+)'),
              data->>'threadTs'
            ) as deployment_id,
            data->>'userId' as user_id,
            MAX(created_on) as last_activity,
            COUNT(*) as message_count
          FROM pgboss.job
          WHERE name = 'thread_response'
            AND data->>'gitBranch' IS NOT NULL
          GROUP BY 
            COALESCE(
              SUBSTRING(data->>'gitBranch' FROM 'claude/session-([0-9.-]+)'),
              data->>'threadTs'
            ),
            data->>'userId'
        ),
        idle_deployments AS (
          SELECT 
            deployment_id,
            user_id,
            last_activity,
            message_count,
            EXTRACT(EPOCH FROM (NOW() - last_activity))/60 as minutes_idle
          FROM deployment_last_activity
          WHERE last_activity < NOW() - INTERVAL '${this.config.worker.idleCleanupMinutes} minutes'
        )
        SELECT 
          deployment_id,
          user_id,
          last_activity,
          minutes_idle,
          message_count
        FROM idle_deployments
        ORDER BY last_activity ASC;
      `;

      const result = await client.query(query);
      
      return result.rows.map(row => ({
        deploymentId: row.deployment_id,
        userId: row.user_id,
        lastActivity: row.last_activity,
        minutesIdle: parseFloat(row.minutes_idle),
        messageCount: parseInt(row.message_count)
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Check if a worker deployment exists in Kubernetes
   */
  async checkWorkerDeploymentExists(deploymentId: string): Promise<boolean> {
    try {
      const deploymentName = `peerbot-worker-${deploymentId}`;
      await this.appsV1Api.readNamespacedDeployment(
        deploymentName,
        this.config.kubernetes.namespace
      );
      return true;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return false;
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Delete a worker deployment and associated resources
   */
  async deleteWorkerDeployment(deploymentId: string): Promise<void> {
    try {
      const deploymentName = `peerbot-worker-${deploymentId}`;
      
      console.log(`🧹 Cleaning up idle worker deployment: ${deploymentName}`);
      
      // Delete the deployment
      try {
        await this.appsV1Api.deleteNamespacedDeployment(
          deploymentName,
          this.config.kubernetes.namespace
        );
        console.log(`✅ Deleted deployment: ${deploymentName}`);
      } catch (error: any) {
        if (error.statusCode === 404) {
          console.log(`⚠️  Deployment ${deploymentName} not found (already deleted)`);
        } else {
          throw error;
        }
      }

      // Delete associated PVC if it exists
      try {
        const pvcName = `peerbot-workspace-${deploymentId}`;
        await this.coreV1Api.deleteNamespacedPersistentVolumeClaim(
          pvcName,
          this.config.kubernetes.namespace
        );
        console.log(`✅ Deleted PVC: ${pvcName}`);
      } catch (error: any) {
        if (error.statusCode === 404) {
          console.log(`⚠️  PVC for ${deploymentName} not found (already deleted)`);
        } else {
          console.log(`⚠️  Failed to delete PVC for ${deploymentName}:`, error.message);
        }
      }

      // Delete associated secret if it exists
      try {
        const secretName = `peerbot-user-secret-${deploymentId.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
        await this.coreV1Api.deleteNamespacedSecret(
          secretName,
          this.config.kubernetes.namespace
        );
        console.log(`✅ Deleted secret: ${secretName}`);
      } catch (error: any) {
        if (error.statusCode === 404) {
          console.log(`⚠️  Secret for ${deploymentName} not found (already deleted)`);
        } else {
          console.log(`⚠️  Failed to delete secret for ${deploymentName}:`, error.message);
        }
      }

    } catch (error) {
      throw new OrchestratorError(
        ErrorCode.DEPLOYMENT_DELETE_FAILED,
        `Failed to delete deployment for ${deploymentId}: ${error instanceof Error ? error.message : String(error)}`,
        { deploymentId, error },
        true
      );
    }
  }

  /**
   * Clean up idle deployments based on configuration
   */
  async cleanupIdleDeployments(): Promise<void> {
    try {
      console.log(`🧹 Starting idle deployment cleanup (threshold: ${this.config.worker.idleCleanupMinutes} minutes)`);
      
      // First, clean up deployments found in database with activity records
      const idleDeployments = await this.findIdleDeployments();
      
      // Second, check for orphaned Kubernetes deployments without database records
      const orphanedDeployments = await this.findOrphanedDeployments();
      
      const totalDeployments = idleDeployments.length + orphanedDeployments.length;
      
      if (totalDeployments === 0) {
        console.log('✅ No idle deployments found to clean up');
        return;
      }

      console.log(`📊 Found ${totalDeployments} idle deployments to clean up (${idleDeployments.length} from database, ${orphanedDeployments.length} orphaned):`);
      
      // Clean up deployments from database activity
      for (const deployment of idleDeployments) {
        console.log(`  - ${deployment.deploymentId} (user: ${deployment.userId}, idle: ${deployment.minutesIdle.toFixed(1)}min, messages: ${deployment.messageCount})`);
        
        try {
          // First check if the deployment actually exists in Kubernetes
          const deploymentExists = await this.checkWorkerDeploymentExists(deployment.deploymentId);
          if (deploymentExists) {
            await this.deleteWorkerDeployment(deployment.deploymentId);
            console.log(`✅ Successfully cleaned up deployment: ${deployment.deploymentId}`);
          } else {
            console.log(`⚠️  Deployment ${deployment.deploymentId} already deleted, skipping`);
          }
        } catch (error) {
          console.error(`❌ Failed to clean up deployment ${deployment.deploymentId}:`, error instanceof Error ? error.message : String(error));
        }
      }
      
      // Clean up orphaned deployments
      for (const deployment of orphanedDeployments) {
        console.log(`  - ${deployment.deploymentId} (orphaned, age: ${deployment.ageMinutes.toFixed(1)}min)`);
        
        try {
          // First check if the deployment actually exists in Kubernetes
          const deploymentExists = await this.checkWorkerDeploymentExists(deployment.deploymentId);
          if (deploymentExists) {
            await this.deleteWorkerDeployment(deployment.deploymentId);
            console.log(`✅ Successfully cleaned up orphaned deployment: ${deployment.deploymentId}`);
          } else {
            console.log(`⚠️  Orphaned deployment ${deployment.deploymentId} already deleted, skipping`);
          }
        } catch (error) {
          console.error(`❌ Failed to clean up orphaned deployment ${deployment.deploymentId}:`, error instanceof Error ? error.message : String(error));
        }
      }
      
      console.log(`🧹 Idle deployment cleanup completed. Cleaned up ${totalDeployments} deployments.`);
      
    } catch (error) {
      console.error('Error during worker deployment cleanup:', error instanceof Error ? error.message : String(error));
      // Don't throw the error - let the cleanup continue on next interval
    }
  }

  /**
   * Find orphaned Kubernetes deployments that exist but have no database records
   */
  async findOrphanedDeployments(): Promise<Array<{
    deploymentId: string;
    ageMinutes: number;
  }>> {
    try {
      // Get all worker deployments from Kubernetes
      const k8sDeployments = await this.appsV1Api.listNamespacedDeployment(
        this.config.kubernetes.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        'app.kubernetes.io/component=worker'
      );

      const activeDeployments = k8sDeployments.body.items || [];
      const orphanedDeployments: Array<{ deploymentId: string; ageMinutes: number }> = [];
      
      // Get all deployment IDs that have database records
      const client = await this.dbPool.getClient();
      let knownDeploymentIds: Set<string>;
      try {
        const query = `
          SELECT DISTINCT 
            COALESCE(
              SUBSTRING(data->>'gitBranch' FROM 'claude/session-([0-9.-]+)'),
              data->>'threadTs'
            ) as deployment_id
          FROM pgboss.job
          WHERE name = 'thread_response'
            AND data->>'gitBranch' IS NOT NULL
        `;
        const result = await client.query(query);
        knownDeploymentIds = new Set(result.rows.map(row => row.deployment_id).filter(Boolean));
      } finally {
        client.release();
      }

      // Check each Kubernetes deployment
      for (const deployment of activeDeployments) {
        const deploymentName = deployment.metadata?.name || '';
        const deploymentId = deploymentName.replace('peerbot-worker-', '');
        const creationTime = deployment.metadata?.creationTimestamp ? new Date(deployment.metadata.creationTimestamp) : new Date();
        const ageMinutes = (Date.now() - creationTime.getTime()) / (1000 * 60);
        
        // If deployment is older than threshold and not in database, it's orphaned
        if (ageMinutes > this.config.worker.idleCleanupMinutes && !knownDeploymentIds.has(deploymentId)) {
          orphanedDeployments.push({ deploymentId, ageMinutes });
        }
      }
      
      return orphanedDeployments.sort((a, b) => b.ageMinutes - a.ageMinutes); // Oldest first
      
    } catch (error) {
      console.error('Error finding orphaned deployments:', error instanceof Error ? error.message : String(error));
      return [];
    }
  }


  /**
   * Find all active deployments ordered by oldest last activity (to delete oldest first)
   */
  async findAllDeploymentsByActivity(): Promise<Array<{
    deploymentId: string;
    userId: string;
    lastActivity: Date;
    messageCount: number;
  }>> {
    const client = await this.dbPool.getClient();
    try {
      const query = `
        WITH deployment_last_activity AS (
          SELECT 
            COALESCE(
              SUBSTRING(data->>'gitBranch' FROM 'claude/session-([0-9.-]+)'),
              data->>'threadTs'
            ) as deployment_id,
            data->>'userId' as user_id,
            MAX(created_on) as last_activity,
            COUNT(*) as message_count
          FROM pgboss.job
          WHERE name = 'thread_response'
            AND data->>'gitBranch' IS NOT NULL
          GROUP BY 
            COALESCE(
              SUBSTRING(data->>'gitBranch' FROM 'claude/session-([0-9.-]+)'),
              data->>'threadTs'
            ),
            data->>'userId'
        )
        SELECT 
          deployment_id,
          user_id,
          last_activity,
          message_count
        FROM deployment_last_activity
        ORDER BY last_activity ASC;
      `;

      const result = await client.query(query);
      
      return result.rows.map(row => ({
        deploymentId: row.deployment_id,
        userId: row.user_id,
        lastActivity: row.last_activity,
        messageCount: parseInt(row.message_count)
      }));
    } finally {
      client.release();
    }
  }
}