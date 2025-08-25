export interface OrchestratorConfig {
  database: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl?: boolean;
  };
  queues: {
    connectionString: string;
    retryLimit: number;
    retryDelay: number;
    expireInSeconds: number;
  };
  worker: {
    image: {
      repository: string;
      tag: string;
    };
    resources: {
      requests: { cpu: string; memory: string };
      limits: { cpu: string; memory: string };
    };
    idleCleanupMinutes: number; // Minutes after which idle workers are deleted
  };
  kubernetes: {
    namespace: string;
  };
}

export interface WorkerDeploymentRequest {
  userId: string;
  botId: string;
  agentSessionId: string;
  threadId: string;
  platform: string;
  platformUserId: string;
  environmentVariables?: Record<string, string>;
}

export interface QueueJob {
  id: string;
  name: string;
  data: any;
  state: 'created' | 'retry' | 'active' | 'completed' | 'failed';
  startAfter?: Date;
  expireIn?: Date;
  createdOn: Date;
  startedOn?: Date;
  completedOn?: Date;
  output?: any;
  priority?: number;
  retryCount?: number;
}

export interface UserQueueConfig {
  userId: string;
  queueName: string;
  deploymentName: string;
  isActive: boolean;
  threadCount: number;
  lastActivity: Date;
  currentReplicas: number;
}

export interface ThreadDeployment {
  threadId: string;
  userId: string;
  deploymentName: string;
  agentSessionId: string;
  createdAt: Date;
  isActive: boolean;
  lastHeartbeat: Date;
}


export interface SimpleDeployment {
  apiVersion: 'apps/v1';
  kind: 'Deployment';
  metadata: {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
  };
  spec: {
    replicas: number;
    selector: {
      matchLabels: Record<string, string>;
    };
    template: {
      metadata: {
        labels: Record<string, string>;
      };
      spec: {
        serviceAccountName?: string;
        containers: Array<{
          name: string;
          image: string;
          imagePullPolicy?: string;
          env?: Array<{
            name: string;
            value?: string;
            valueFrom?: {
              secretKeyRef?: {
                name: string;
                key: string;
              };
            };
          }>;
          ports?: Array<{
            name: string;
            containerPort: number;
            protocol?: string;
          }>;
          livenessProbe?: any;
          readinessProbe?: any;
          resources?: {
            requests?: Record<string, string>;
            limits?: Record<string, string>;
          };
          volumeMounts?: Array<{
            name: string;
            mountPath: string;
          }>;
        }>;
        volumes?: Array<{
          name: string;
          persistentVolumeClaim?: {
            claimName: string;
          };
          emptyDir?: {};
        }>;
      };
    };
  };
}

export enum ErrorCode {
  DATABASE_CONNECTION_FAILED = 'DATABASE_CONNECTION_FAILED',
  KUBERNETES_API_ERROR = 'KUBERNETES_API_ERROR',
  DEPLOYMENT_SCALE_FAILED = 'DEPLOYMENT_SCALE_FAILED',
  DEPLOYMENT_CREATE_FAILED = 'DEPLOYMENT_CREATE_FAILED',
  DEPLOYMENT_DELETE_FAILED = 'DEPLOYMENT_DELETE_FAILED',
  QUEUE_JOB_PROCESSING_FAILED = 'QUEUE_JOB_PROCESSING_FAILED',
  USER_CREDENTIALS_CREATE_FAILED = 'USER_CREDENTIALS_CREATE_FAILED',
  SECRET_CREATE_FAILED = 'SECRET_CREATE_FAILED',
  PVC_CREATE_FAILED = 'PVC_CREATE_FAILED',
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
  THREAD_DEPLOYMENT_NOT_FOUND = 'THREAD_DEPLOYMENT_NOT_FOUND',
  USER_QUEUE_NOT_FOUND = 'USER_QUEUE_NOT_FOUND'
}

export class OrchestratorError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: any,
    public shouldRetry: boolean = false
  ) {
    super(message);
    this.name = 'OrchestratorError';
  }

  static fromKubernetesError(error: any): OrchestratorError {
    return new OrchestratorError(
      ErrorCode.KUBERNETES_API_ERROR,
      `Kubernetes API error: ${error instanceof Error ? error.message : String(error)}`,
      { 
        status: error.statusCode,
        reason: error.body?.reason,
        details: error.body?.details 
      },
      error.statusCode >= 500
    );
  }

  static fromDatabaseError(error: any): OrchestratorError {
    return new OrchestratorError(
      ErrorCode.DATABASE_CONNECTION_FAILED,
      `Database error: ${error instanceof Error ? error.message : String(error)}`,
      { code: error.code, detail: error.detail },
      true
    );
  }
}