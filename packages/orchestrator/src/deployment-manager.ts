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
    kc.loadFromDefault();
    
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
   * Create PostgreSQL user with generated credentials
   */
  private async createPostgresUser(username: string, password: string): Promise<void> {
    const client = await this.dbPool.getClient();
    try {
      // Check if user already exists
      const userExists = await client.query(
        'SELECT 1 FROM pg_user WHERE usename = $1',
        [username]
      );
      
      if (userExists.rows.length === 0) {
        // Create user with password
        await client.query(`CREATE USER "${username}" WITH PASSWORD '${password}'`);
        console.log(`Created PostgreSQL user: ${username}`);
        
        // Grant necessary permissions for pgboss schema
        await client.query(`GRANT USAGE ON SCHEMA pgboss TO "${username}"`);
        await client.query(`GRANT ALL ON ALL TABLES IN SCHEMA pgboss TO "${username}"`);
        await client.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA pgboss TO "${username}"`);
        await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT ALL ON TABLES TO "${username}"`);
        await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT ALL ON SEQUENCES TO "${username}"`);
        console.log(`Granted pgboss permissions to user: ${username}`);
      } else {
        console.log(`PostgreSQL user already exists: ${username}`);
        
        // Grant permissions even if user exists (in case they were missing)
        try {
          await client.query(`GRANT USAGE ON SCHEMA pgboss TO "${username}"`);
          await client.query(`GRANT ALL ON ALL TABLES IN SCHEMA pgboss TO "${username}"`);
          await client.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA pgboss TO "${username}"`);
          await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT ALL ON TABLES TO "${username}"`);
          await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT ALL ON SEQUENCES TO "${username}"`);
          console.log(`Granted pgboss permissions to existing user: ${username}`);
        } catch (permError) {
          console.error(`Failed to grant permissions to existing user ${username}:`, permError);
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
              imagePullPolicy: 'Always',
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
                }
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




}