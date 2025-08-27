import { DatabasePool } from './database-pool';

export class DatabaseManager {
  private dbPool: DatabasePool;

  constructor(dbPool: DatabasePool) {
    this.dbPool = dbPool;
  }

  /**
   * Generate PostgreSQL username from user ID (one user per Slack user)
   */
  generatePostgresUsername(userId: string): string {
    // Create one PostgreSQL user per Slack user ID
    const username = userId.toLowerCase().substring(0, 63); // PostgreSQL max username length
    return username;
  }

  /**
   * Generate random password for PostgreSQL user (URL-safe characters only)
   */
  generateRandomPassword(): string {
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
  async createPostgresUser(username: string, password: string): Promise<void> {
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
}