import type { SessionContext } from "./types";

/**
 * Session utilities shared across packages
 */
export class SessionUtils {
  /**
   * Generate session key from context
   */
  static generateSessionKey(context: SessionContext): string {
    // Use thread timestamp as the session key (if in a thread)
    // Otherwise use message timestamp
    const timestamp = context.threadTs || context.messageTs || '';
    
    // If we have a thread timestamp, use it directly as the session key
    // This ensures consistency across all worker executions in the same thread
    if (context.threadTs) {
      return context.threadTs;
    }

    // For direct messages (no thread), use the channel and message timestamp
    return `${context.channelId}-${timestamp}`;
  }
}