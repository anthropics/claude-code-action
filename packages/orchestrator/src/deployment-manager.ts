import * as k8s from '@kubernetes/client-node';
import { 
  OrchestratorConfig, 
  SimpleDeployment, 
  OrchestratorError,
  ErrorCode 
} from './types';
import { DatabasePool } from './database-pool';
import { DatabaseManager } from './database-manager';
import { SecretManager } from './secret-manager';

export class DeploymentManager {
  private appsV1Api: k8s.AppsV1Api;
  private coreV1Api: k8s.CoreV1Api;
  private config: OrchestratorConfig;
  private dbPool: DatabasePool;
  private databaseManager: DatabaseManager;
  private secretManager: SecretManager;

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
    
    // Initialize managers
    this.databaseManager = new DatabaseManager(dbPool);
    this.secretManager = new SecretManager(this.coreV1Api, config);
  }





  /**
   * Create worker deployment for handling messages
   */
  async createWorkerDeployment(userId: string, threadId: string, teamId?: string, messageData?: any): Promise<void> {
    const deploymentName = `peerbot-worker-${threadId}`;
    
    try {
      // Always ensure user credentials exist first
      const username = this.databaseManager.generatePostgresUsername(userId);
      
      console.log(`Ensuring PostgreSQL user and secret for ${username}...`);
      
      // Check if secret already exists and get existing password, or generate new one
      await this.secretManager.getOrCreateUserCredentials(username, 
        (username: string, password: string) => this.databaseManager.createPostgresUser(username, password));

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
   * Reconcile deployments: unified method for cleanup and resource management
   */
  async reconcileDeployments(): Promise<void> {
    try {
      console.log('🔄 Starting deployment reconciliation...');
      
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
      console.log(`📊 Found ${activeDeployments.length} worker deployments to reconcile`);
      
      if (activeDeployments.length === 0) {
        console.log('✅ No deployments to reconcile');
        return;
      }

      const now = Date.now();
      const idleThresholdMinutes = this.config.worker.idleCleanupMinutes;
      const maxDeployments = this.config.worker.maxDeployments || 20;
      
      // Analyze all deployments
      const deploymentAnalysis = activeDeployments.map((deployment: any) => {
        const deploymentName = deployment.metadata?.name || '';
        const deploymentId = deploymentName.replace('peerbot-worker-', '');
        
        // Get last activity from annotations or fallback to creation time
        const lastActivityStr = deployment.metadata?.annotations?.['peerbot.io/last-activity'] ||
                               deployment.metadata?.annotations?.['peerbot.io/created'] ||
                               deployment.metadata?.creationTimestamp;
        
        const lastActivity = lastActivityStr ? new Date(lastActivityStr) : new Date();
        const minutesIdle = (now - lastActivity.getTime()) / (1000 * 60);
        const daysSinceActivity = minutesIdle / (60 * 24);
        const replicas = deployment.spec?.replicas || 0;
        
        return {
          deploymentName,
          deploymentId,
          lastActivity,
          minutesIdle,
          daysSinceActivity,
          replicas,
          isIdle: minutesIdle >= idleThresholdMinutes,
          isVeryOld: daysSinceActivity >= 7
        };
      }).sort((a, b) => a.lastActivity.getTime() - b.lastActivity.getTime()); // Oldest first
      
      let processedCount = 0;
      
      // Process each deployment based on its state
      for (const analysis of deploymentAnalysis) {
        const { deploymentName, deploymentId, minutesIdle, daysSinceActivity, replicas, isIdle, isVeryOld } = analysis;
        
        if (isVeryOld) {
          // Delete very old deployments (>= 7 days)
          console.log(`🗑️  Deleting very old deployment: ${deploymentName} (${daysSinceActivity.toFixed(1)} days old)`);
          try {
            await this.deleteWorkerDeployment(deploymentId);
            processedCount++;
            console.log(`✅ Deleted old deployment: ${deploymentName}`);
          } catch (error) {
            console.error(`❌ Failed to delete deployment ${deploymentName}:`, error);
          }
        } else if (isIdle && replicas > 0) {
          // Scale down idle deployments
          console.log(`⏸️  Scaling down idle deployment: ${deploymentName} (idle ${minutesIdle.toFixed(1)}min)`);
          try {
            await this.scaleDeployment(deploymentName, 0);
            processedCount++;
            console.log(`✅ Scaled down deployment: ${deploymentName}`);
          } catch (error) {
            console.error(`❌ Failed to scale down deployment ${deploymentName}:`, error);
          }
        }
      }
      
      // Check if we exceed max deployments (after cleanup)
      const remainingDeployments = deploymentAnalysis.filter(d => !d.isVeryOld);
      if (remainingDeployments.length > maxDeployments) {
        const excessCount = remainingDeployments.length - maxDeployments;
        console.log(`⚠️  Too many deployments (${remainingDeployments.length} > ${maxDeployments}), cleaning up ${excessCount} oldest`);
        
        const deploymentsToDelete = remainingDeployments.slice(0, excessCount);
        for (const { deploymentName, deploymentId } of deploymentsToDelete) {
          console.log(`🧹 Removing excess deployment: ${deploymentName}`);
          try {
            await this.deleteWorkerDeployment(deploymentId);
            processedCount++;
            console.log(`✅ Removed excess deployment: ${deploymentName}`);
          } catch (error) {
            console.error(`❌ Failed to remove deployment ${deploymentName}:`, error);
          }
        }
      }
      
      console.log(`🔄 Deployment reconciliation completed. Processed ${processedCount} deployments.`);
      
    } catch (error) {
      console.error('Error during deployment reconciliation:', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Update deployment activity annotation
   */
  async updateDeploymentActivity(deploymentName: string): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const patch = {
        metadata: {
          annotations: {
            'peerbot.io/last-activity': timestamp
          }
        }
      };

      await this.appsV1Api.patchNamespacedDeployment(
        deploymentName,
        this.config.kubernetes.namespace,
        patch
      );
      
      console.log(`✅ Updated activity timestamp for deployment: ${deploymentName}`);
    } catch (error) {
      console.error(`❌ Failed to update activity for deployment ${deploymentName}:`, error instanceof Error ? error.message : String(error));
      // Don't throw - activity tracking should not block message processing
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

}