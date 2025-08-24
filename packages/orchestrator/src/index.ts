#!/usr/bin/env bun

import { config as dotenvConfig } from 'dotenv';
import { join } from 'path';
import { OrchestratorConfig, OrchestratorError, ErrorCode } from './types';
import { DatabasePool } from './database-pool';
import { DeploymentManager } from './deployment-manager';
import { QueueConsumer } from './queue-consumer';

class PeerbotOrchestrator {
  private config: OrchestratorConfig;
  private dbPool: DatabasePool;
  private deploymentManager: DeploymentManager;
  private queueConsumer: QueueConsumer;
  private isRunning = false;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.dbPool = new DatabasePool(config.database);
    this.deploymentManager = new DeploymentManager(config, this.dbPool);
    this.queueConsumer = new QueueConsumer(config, this.deploymentManager);
  }

  async start(): Promise<void> {
    try {
      console.log('🚀 Starting Peerbot Orchestrator with simple deployment scaling...');

      // Test database connection
      await this.testDatabaseConnection();
      console.log('✅ Database connection verified');

      // Start queue consumer
      await this.queueConsumer.start();
      console.log('✅ Queue consumer started');

      // Setup health endpoints
      this.setupHealthEndpoints();
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();

      this.isRunning = true;
      console.log('🎉 Peerbot Orchestrator is running!');
      console.log(`- Kubernetes namespace: ${this.config.kubernetes.namespace}`);
      console.log('- Simple deployment scaling with 5-minute idle timeout');
      console.log('- Deployments start with 1 replica and scale to 0 after idle');

    } catch (error) {
      console.error('❌ Failed to start orchestrator:', error);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('🛑 Stopping Peerbot Orchestrator...');
    this.isRunning = false;

    try {
      await this.queueConsumer.stop();
      await this.dbPool.close();
      console.log('✅ Orchestrator stopped gracefully');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }

  private async testDatabaseConnection(): Promise<void> {
    try {
      await this.dbPool.query('SELECT 1');
    } catch (error) {
      throw new OrchestratorError(
        ErrorCode.DATABASE_CONNECTION_FAILED,
        `Database connection failed: ${error instanceof Error ? error.message : String(error)}`,
        { error },
        false
      );
    }
  }

  private setupHealthEndpoints(): void {
    const http = require('http');
    
    const server = http.createServer(async (req: any, res: any) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      
      res.setHeader('Content-Type', 'application/json');
      
      if (url.pathname === '/health') {
        // Health check endpoint
        const health = {
          service: 'peerbot-orchestrator',
          status: this.isRunning ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        };
        res.statusCode = this.isRunning ? 200 : 503;
        res.end(JSON.stringify(health));
        
      } else if (url.pathname === '/ready') {
        // Readiness check endpoint
        try {
          await this.dbPool.query('SELECT 1');
          const ready = {
            service: 'peerbot-orchestrator',
            status: 'ready',
            timestamp: new Date().toISOString()
          };
          res.statusCode = 200;
          res.end(JSON.stringify(ready));
        } catch (error) {
          const notReady = {
            service: 'peerbot-orchestrator',
            status: 'not ready',
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
          };
          res.statusCode = 503;
          res.end(JSON.stringify(notReady));
        }
        
      } else if (url.pathname === '/stats') {
        // Queue statistics endpoint
        try {
          const stats = await this.queueConsumer.getQueueStats();
          res.statusCode = 200;
          res.end(JSON.stringify(stats));
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
        
      } else if (req.method === 'POST' && url.pathname.startsWith('/scale/')) {
        // Scale deployment endpoint: POST /scale/{deploymentName}/{replicas}
        const pathParts = url.pathname.split('/');
        if (pathParts.length === 4 && pathParts[1] === 'scale') {
          const deploymentName = pathParts[2];
          const replicas = parseInt(pathParts[3]);
          
          if (isNaN(replicas) || replicas < 0) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid replica count' }));
            return;
          }

          try {
            // Read request body for metadata
            let body = '';
            req.on('data', (chunk: any) => {
              body += chunk.toString();
            });
            
            req.on('end', async () => {
              try {
                const metadata = body ? JSON.parse(body) : {};
                console.log(`Scaling deployment ${deploymentName} to ${replicas} replicas (requested by: ${metadata.requestedBy || 'unknown'})`);
                
                // Scale the deployment using deployment manager
                await this.deploymentManager.scaleDeployment(deploymentName, replicas);
                
                const result = {
                  service: 'peerbot-orchestrator',
                  action: 'scale',
                  deployment: deploymentName,
                  replicas: replicas,
                  timestamp: new Date().toISOString(),
                  requestedBy: metadata.requestedBy || 'unknown',
                  reason: metadata.reason || 'Manual scaling request'
                };
                
                res.statusCode = 200;
                res.end(JSON.stringify(result));
              } catch (error) {
                console.error(`Failed to scale deployment ${deploymentName}:`, error);
                res.statusCode = 500;
                res.end(JSON.stringify({ 
                  error: error instanceof Error ? error.message : String(error),
                  deployment: deploymentName,
                  requestedReplicas: replicas
                }));
              }
            });
          } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Failed to read request body' }));
          }
        } else {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Invalid scale endpoint format. Use POST /scale/{deploymentName}/{replicas}' }));
        }
        
      } else {
        // 404 for other paths
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    const port = process.env.ORCHESTRATOR_PORT || 8080;
    server.listen(port, () => {
      console.log(`📊 Health endpoints available on port ${port}`);
      console.log(`  - Health: http://localhost:${port}/health`);
      console.log(`  - Ready: http://localhost:${port}/ready`);
      console.log(`  - Stats: http://localhost:${port}/stats`);
    });
  }

  private setupGracefulShutdown(): void {
    const cleanup = async () => {
      console.log('🔄 Received shutdown signal, gracefully shutting down...');
      await this.stop();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    
    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught exception:', error);
      cleanup();
    });

    process.on('unhandledRejection', (reason) => {
      console.error('💥 Unhandled rejection:', reason);
      cleanup();
    });
  }

  /**
   * Get orchestrator status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      config: {
        kubernetes: {
          namespace: this.config.kubernetes.namespace
        },
        queues: {
          retryLimit: this.config.queues.retryLimit,
          expireInHours: this.config.queues.expireInHours
        }
      }
    };
  }
}

/**
 * Main entry point
 */
async function main() {
  try {
    // Load environment variables
    const envPath = join(__dirname, '../../../.env');
    dotenvConfig({ path: envPath });

    console.log('🔧 Loading orchestrator configuration...');

    // Load configuration from environment
    const config: OrchestratorConfig = {
      database: {
        host: process.env.DATABASE_HOST || 'localhost',
        port: parseInt(process.env.DATABASE_PORT || '5432'),
        database: process.env.DATABASE_NAME || 'peerbot',
        username: process.env.DATABASE_USERNAME || 'postgres',
        password: process.env.DATABASE_PASSWORD || '',
        ssl: process.env.DATABASE_SSL === 'true'
      },
      queues: {
        connectionString: process.env.POSTGRESQL_CONNECTION_STRING!,
        retryLimit: parseInt(process.env.PGBOSS_RETRY_LIMIT || '3'),
        retryDelay: parseInt(process.env.PGBOSS_RETRY_DELAY || '30'),
        expireInHours: parseInt(process.env.PGBOSS_EXPIRE_HOURS || '22')
      },
      worker: {
        image: {
          repository: process.env.WORKER_IMAGE_REPOSITORY || 'peerbot-worker',
          tag: process.env.WORKER_IMAGE_TAG || 'latest'
        },
        resources: {
          requests: {
            cpu: process.env.WORKER_CPU_REQUEST || '100m',
            memory: process.env.WORKER_MEMORY_REQUEST || '256Mi'
          },
          limits: {
            cpu: process.env.WORKER_CPU_LIMIT || '1000m', 
            memory: process.env.WORKER_MEMORY_LIMIT || '2Gi'
          }
        }
      },
      kubernetes: {
        namespace: process.env.KUBERNETES_NAMESPACE || 'peerbot'
      }
    };

    // Validate required configuration
    if (!config.queues.connectionString) {
      throw new Error('POSTGRESQL_CONNECTION_STRING is required');
    }

    if (!config.database.password) {
      throw new Error('DATABASE_PASSWORD is required');
    }

    // Create and start orchestrator
    const orchestrator = new PeerbotOrchestrator(config);
    await orchestrator.start();

    // Keep the process alive
    process.on('SIGUSR1', () => {
      const status = orchestrator.getStatus();
      console.log('📊 Orchestrator status:', JSON.stringify(status, null, 2));
    });

  } catch (error) {
    console.error('💥 Failed to start Peerbot Orchestrator:', error);
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  main();
}

export { PeerbotOrchestrator };
export type { OrchestratorConfig } from './types';