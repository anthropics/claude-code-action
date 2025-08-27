import { Pool, PoolClient } from 'pg';
import { OrchestratorConfig, OrchestratorError, ErrorCode } from './types';

export class DatabasePool {
  private pool: Pool;
  private config: OrchestratorConfig['database'];

  constructor(config: OrchestratorConfig['database']) {
    this.config = config;
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    this.pool.on('error', (err) => {
      console.error('Database pool error:', err);
    });
  }

  async getClient(): Promise<PoolClient> {
    try {
      return await this.pool.connect();
    } catch (error) {
      throw OrchestratorError.fromDatabaseError(error);
    }
  }

  async query(text: string, params?: any[]): Promise<any> {
    try {
      const result = await this.pool.query(text, params);
      return result;
    } catch (error) {
      throw OrchestratorError.fromDatabaseError(error);
    }
  }

  async queryWithUserContext(userId: string, text: string, params?: any[]): Promise<any> {
    const client = await this.getClient();
    try {
      // Set user context for RLS
      await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', userId]);
      const result = await client.query(text, params);
      return result;
    } catch (error) {
      throw OrchestratorError.fromDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async transactionWithUserContext<T>(
    userId: string,
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      // Set user context for RLS
      await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', userId]);
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw OrchestratorError.fromDatabaseError(error);
    } finally {
      client.release();
    }
  }



  /**
   * Update job status in database
   */
  async updateJobStatus(
    jobId: string,
    status: string,
    output?: any,
    errorMessage?: string
  ): Promise<void> {
    try {
      await this.query(
        'SELECT update_job_status($1, $2, $3, $4)',
        [jobId, status, output ? JSON.stringify(output) : null, errorMessage]
      );
    } catch (error) {
      console.error(`Failed to update job status for ${jobId}:`, error);
      // Don't throw - job status updates are best effort
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}