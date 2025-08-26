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
        kc.loadFromCluster();
        console.log('✅ Loaded in-cluster Kubernetes config');
      } else {
        kc.loadFromDefault();
        console.log('✅ Loaded default Kubernetes config');
      }
    } catch (error) {
      console.error('❌ Failed to load Kubernetes config:', error);
      // Try to load default config as fallback
      try {
        kc.loadFromDefault();
        console.log('✅ Loaded default Kubernetes config as fallback');
      } catch (fallbackError) {
        console.error('❌ Failed to load fallback Kubernetes config:', fallbackError);
        throw new OrchestratorError(
          ErrorCode.DEPLOYMENT_CREATE_FAILED,
          `Failed to initialize Kubernetes client: ${error instanceof Error ? error.message : String(error)}`,
          { error, fallbackError },
          true
        );
      }
    }
    
    this.appsV1Api = kc.makeApiClient(k8s.AppsV1Api);
    this.coreV1Api = kc.makeApiClient(k8s.CoreV1Api);
  }



  /**
   * Generate PostgreSQL username in format: slack_[workspaceid]_[userid] (lowercase)
   */
  private generatePostgresUsername(userId: string, teamId?: string): string {
    const workspaceId = teamId || 'unknown';
    
    return `slack_${workspaceId}_${userId}`.toLowerCase();
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
   * Create PostgreSQL user with generated credentials and isolated schema
   */
  private async createPostgresUser(username: string, password: string): Promise<void> {
    const client = await this.dbPool.getClient();
    const schemaName = `user_${username.replace(/[^a-zA-Z0-9]/g, '_')}`;
    
    try {
      // Check if user already exists
      const userExists = await client.query(
        'SELECT 1 FROM pg_user WHERE usename = $1',
        [username]
      );
      
      if (userExists.rows.length === 0) {
        // Create user with password
        await client.query(`CREATE USER "${username}" WITH PASSWORD '${password}' NOCREATEDB NOCREATEROLE`);
        console.log(`Created PostgreSQL user: ${username}`);
        
        // Create isolated schema for user
        await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}" AUTHORIZATION "${username}"`);
        console.log(`Created schema: ${schemaName}`);
        
        // Set default search path to user schema and pgboss
        await client.query(`ALTER USER "${username}" SET search_path TO "${schemaName}", pgboss`);
        
        // Grant limited pgboss permissions - only for their own jobs
        await client.query(`GRANT USAGE ON SCHEMA pgboss TO "${username}"`);
        await client.query(`GRANT SELECT, INSERT, UPDATE ON pgboss.job TO "${username}"`);
        await client.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA pgboss TO "${username}"`);
        
        // Create row-level security policy for pgboss.job table
        await client.query(`ALTER TABLE pgboss.job ENABLE ROW LEVEL SECURITY`);
        await client.query(`
          CREATE POLICY "${username}_job_policy" ON pgboss.job 
          FOR ALL TO "${username}"
          USING (data->>'userId' = '${username}' OR name LIKE 'thread_message_peerbot-worker-%')
        `);
        
        console.log(`Created isolated schema and RLS policies for: ${username}`);
      } else {
        console.log(`PostgreSQL user already exists: ${username}`);
        
        // Ensure schema exists and permissions are correct
        try {
          await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}" AUTHORIZATION "${username}"`);
          await client.query(`ALTER USER "${username}" SET search_path TO "${schemaName}", pgboss`);
          await client.query(`GRANT USAGE ON SCHEMA pgboss TO "${username}"`);
          await client.query(`GRANT SELECT, INSERT, UPDATE ON pgboss.job TO "${username}"`);
          await client.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA pgboss TO "${username}"`);
        } catch (permError) {
          console.error(`Failed to update permissions for existing user ${username}:`, permError);
        }
      }
    } finally {
      client.release();
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
      const username = this.generatePostgresUsername(userId, teamId);
      const password = this.generateRandomPassword();
      
      console.log(`Ensuring PostgreSQL user and secret for ${username}...`);
      await this.createPostgresUser(username, password);
      await this.createUserSecret(username, password);

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
                  value: messageData?.platformMetadata?.repositoryUrl || process.env.DEFAULT_REPOSITORY_URL || 'https://github.com/default/repo'
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
                }] : [])
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
   * Enforce maximum deployment limit by removing oldest inactive deployments
   */
  async enforceMaxDeploymentLimit(): Promise<void> {
    const client = await this.dbPool.getClient();
    try {
      const maxDeployments = this.config.worker.maxDeployments || 10;
      
      // Query active threads from database
      const activeThreadsQuery = `
        SELECT DISTINCT 
          data->>'threadId' as thread_id,
          data->>'userId' as user_id,
          MIN(created_on) as first_activity,
          MAX(created_on) as last_activity,
          COUNT(*) as message_count
        FROM pgboss.job
        WHERE name LIKE 'thread_message_%'
          AND created_on > NOW() - INTERVAL '24 hours'
        GROUP BY data->>'threadId', data->>'userId'
        ORDER BY MAX(created_on) ASC
        LIMIT $1 OFFSET $2
      `;
      
      // Get total active threads count
      const countResult = await client.query(`
        SELECT COUNT(DISTINCT data->>'threadId') as total
        FROM pgboss.job
        WHERE name LIKE 'thread_message_%'
          AND created_on > NOW() - INTERVAL '24 hours'
      `);
      
      const totalThreads = parseInt(countResult.rows[0]?.total || '0');
      
      if (totalThreads > maxDeployments) {
        const excessCount = totalThreads - maxDeployments;
        
        // Get oldest threads to delete
        const threadsToDelete = await client.query(activeThreadsQuery, [excessCount, 0]);
        
        for (const thread of threadsToDelete.rows) {
          const deploymentName = `peerbot-worker-${thread.thread_id}`;
          console.log(`🧹 Removing excess deployment: ${deploymentName} (last activity: ${thread.last_activity})`);
          
          try {
            await this.appsV1Api.deleteNamespacedDeployment(
              deploymentName,
              this.config.kubernetes.namespace
            );
          } catch (error: any) {
            if (error.statusCode !== 404) {
              console.error(`Failed to delete deployment ${deploymentName}:`, error);
            }
          }
        }
        
        console.log(`✅ Removed ${threadsToDelete.rows.length} excess deployments`);
      }
    } catch (error) {
      console.error('Failed to enforce deployment limit:', error);
    } finally {
      client.release();
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
          await this.deleteWorkerDeployment(deployment.deploymentId);
          console.log(`✅ Successfully cleaned up deployment: ${deployment.deploymentId}`);
        } catch (error) {
          console.error(`❌ Failed to clean up deployment ${deployment.deploymentId}:`, error instanceof Error ? error.message : String(error));
        }
      }
      
      // Clean up orphaned deployments
      for (const deployment of orphanedDeployments) {
        console.log(`  - ${deployment.deploymentId} (orphaned, age: ${deployment.ageMinutes.toFixed(1)}min)`);
        
        try {
          await this.deleteWorkerDeployment(deployment.deploymentId);
          console.log(`✅ Successfully cleaned up orphaned deployment: ${deployment.deploymentId}`);
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