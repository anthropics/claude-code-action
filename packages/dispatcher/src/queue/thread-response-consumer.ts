#!/usr/bin/env bun

import PgBoss from "pg-boss";
import { WebClient } from "@slack/web-api";
import type { GitHubRepositoryManager } from "../github/repository-manager";
// Simple blockkit detection and conversion for now
function processMarkdownAndBlockkit(content: string): { text: string; blocks: any[] } {
  // Process blockkit with metadata
  const codeBlockRegex = /```(\w+)\s*\{([^}]+)\}\s*\n?([\s\S]*?)\n?```/g;
  let processedContent = content;
  const actionButtons: any[] = [];

  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const [fullMatch, language, metadataStr, codeContent] = match;
    
    try {
      const metadata: any = {};
      metadataStr.split(',').forEach(pair => {
        const [key, value] = pair.split(':').map(s => s.trim());
        if (key && value) {
          const cleanKey = key.replace(/"/g, '');
          let cleanValue: any = value.replace(/"/g, '');
          if (cleanValue === 'true') cleanValue = true;
          if (cleanValue === 'false') cleanValue = false;
          metadata[cleanKey] = cleanValue;
        }
      });

      if (metadata.action) {
        if (metadata.show === false) {
          console.log(`[DEBUG] Skipping blockkit with show:false - action: ${metadata.action}`);
          processedContent = processedContent.replace(fullMatch, '');
          continue;
        }
        
        if (language === 'blockkit') {
          const parsed = codeContent ? JSON.parse(codeContent.trim()) : { blocks: [] };
          actionButtons.push({
            type: "button",
            text: { type: "plain_text", text: metadata.action },
            action_id: `blockkit_form_${Date.now()}`,
            value: JSON.stringify({ blocks: parsed.blocks || [parsed] })
          });
          processedContent = processedContent.replace(fullMatch, '');
        } else {
          if (codeContent && codeContent.length <= 2000) {
            actionButtons.push({
              type: "button",
              text: { type: "plain_text", text: metadata.action },
              action_id: `${language}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
              value: codeContent
            });
          }
          if (metadata.show === false) {
            processedContent = processedContent.replace(fullMatch, '');
          }
        }
      }
    } catch (error) {
      console.error('Failed to parse code block:', error);
    }
  }

  // Convert basic markdown
  const text = processedContent
    .replace(/\*\*(.*?)\*\*/g, '*$1*')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '_$1_')
    .trim();

  // Always create at least one block
  const blocks: any[] = [];
  
  if (text) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: text
      }
    });
  }

  if (actionButtons.length > 0) {
    if (blocks.length > 0) blocks.push({ type: "divider" });
    blocks.push({
      type: "actions",
      elements: actionButtons
    });
  }

  return { text, blocks };
}


/**
 * Generate GitHub action buttons for the session branch
 */
async function generateGitHubActionButtons(
  userId: string,
  gitBranch: string | undefined,
  userMappings: Map<string, string>,
  repoManager: GitHubRepositoryManager
): Promise<any[] | undefined> {
  try {
    logger.debug(`Generating GitHub action buttons for user ${userId}, gitBranch: ${gitBranch}`);
    
    // If no git branch provided, don't show Edit button
    if (!gitBranch) {
      logger.debug(`No git branch provided, skipping Edit button`);
      return undefined;
    }
    
    // Get GitHub username from Slack user ID
    const githubUsername = userMappings.get(userId);
    if (!githubUsername) {
      logger.debug(`No GitHub username mapping found for user ${userId}`);
      return undefined;
    }

    // Get repository information
    const repository = await repoManager.getRepositoryInfo(githubUsername);
    if (!repository) {
      logger.debug(`No repository found for GitHub user ${githubUsername}`);
      return undefined;
    }

    const repoUrl = repository.repositoryUrl;
    const repoPath = repoUrl.replace('https://github.com/', '');
    
    logger.info(`Showing Edit button for branch: ${gitBranch}`);
    return [
      `<https://github.com/${repoPath}/compare/${gitBranch}...${gitBranch}?quick_pull=1&labels=peerbot|🔀 Pull Request>`,
      `<https://github.dev/${repoPath}/tree/${gitBranch}|Code>`,
    ];
  } catch (error) {
    // Return undefined on error - this will result in no action buttons being added
    return undefined;
  }
}

import logger from "../logger";

interface ThreadResponsePayload {
  messageId: string;
  channelId: string;
  threadTs: string;
  userId: string;
  content?: string;
  isDone: boolean;
  reaction?: string;
  error?: string;
  timestamp: number;
  originalMessageTs?: string; // User's original message timestamp for reactions
  gitBranch?: string; // Current git branch for Edit button URLs
}

/**
 * Consumer that listens to thread_response queue and updates Slack messages
 * This handles all Slack communication that was previously done by the worker
 */
export class ThreadResponseConsumer {
  private pgBoss: PgBoss;
  private slackClient: WebClient;
  private isRunning = false;
  private repoManager: GitHubRepositoryManager;
  private userMappings: Map<string, string>; // slackUserId -> githubUsername

  constructor(
    connectionString: string,
    slackToken: string,
    repoManager: GitHubRepositoryManager,
    userMappings: Map<string, string>
  ) {
    this.pgBoss = new PgBoss(connectionString);
    this.slackClient = new WebClient(slackToken);
    this.repoManager = repoManager;
    this.userMappings = userMappings;
  }

  /**
   * Start consuming thread_response messages
   */
  async start(): Promise<void> {
    try {
      await this.pgBoss.start();
      
      // Create the thread_response queue if it doesn't exist
      await this.pgBoss.createQueue('thread_response');
      
      // Register job handler for thread response messages
      await this.pgBoss.work(
        'thread_response',
        this.handleThreadResponse.bind(this)
      );

      this.isRunning = true;
      logger.info("✅ Thread response consumer started");
      
    } catch (error) {
      logger.error("Failed to start thread response consumer:", error);
      throw error;
    }
  }

  /**
   * Stop the consumer
   */
  async stop(): Promise<void> {
    try {
      this.isRunning = false;
      await this.pgBoss.stop();
      logger.info("✅ Thread response consumer stopped");
    } catch (error) {
      logger.error("Error stopping thread response consumer:", error);
      throw error;
    }
  }

  /**
   * Handle thread response message jobs
   */
  private async handleThreadResponse(job: any): Promise<void> {
    let data;
    
    try {
      logger.info(`Received thread response job structure: ${JSON.stringify({
        type: typeof job,
        keys: Object.keys(job || {}),
        hasNumericKeys: Object.keys(job || {}).some(k => !isNaN(Number(k)))
      })}`);
      
      // Handle PgBoss serialized format (similar to worker queue consumer)
      if (typeof job === 'object' && job !== null) {
        const keys = Object.keys(job);
        const numericKeys = keys.filter(key => !isNaN(Number(key)));
        
        if (numericKeys.length > 0) {
          // PgBoss passes jobs as an array, get the first element
          const firstKey = numericKeys[0];
          const firstJob = firstKey ? job[firstKey] : null;
          
          if (typeof firstJob === 'object' && firstJob !== null && firstJob.data) {
            // This is the actual job object from PgBoss
            data = firstJob.data;
            logger.info(`Successfully extracted thread response job data for job ${firstJob.id}`);
          } else {
            throw new Error('Invalid job format: expected job object with data field');
          }
        } else {
          // Fallback - might be normal job format
          data = job.data || job;
        }
      } else {
        data = job;
      }
      
      if (!data || !data.messageId) {
        throw new Error(`Invalid thread response data: ${JSON.stringify(data)}`);
      }
      
      logger.info(`Processing thread response job for message ${data.messageId}`);

      // Handle different types of responses and manage reactions based on isDone status
      // Use originalMessageTs for reactions (user's message), not the bot's message
      const reactionTimestamp = data.originalMessageTs || data.messageId;
      
      if (data.content) {
        await this.handleMessageUpdate(data);
        
        // Handle reactions based on isDone status
        if (!data.isDone) {
          // Worker is processing - add gear reaction to user's message
          try {
            await this.slackClient.reactions.add({
              channel: data.channelId,
              timestamp: reactionTimestamp,
              name: "gear",
            });
            logger.info(`Added gear reaction to message ${reactionTimestamp}`);
          } catch (error) {
            logger.warn(`Failed to add gear reaction:`, error);
          }
        } else {
          // Processing completed - replace gear with checkmark on user's message
          try {
            await this.slackClient.reactions.remove({
              channel: data.channelId,
              timestamp: reactionTimestamp,
              name: "gear",
            });
            await this.slackClient.reactions.add({
              channel: data.channelId,
              timestamp: reactionTimestamp,
              name: "white_check_mark",
            });
            logger.info(`Replaced gear with checkmark on message ${reactionTimestamp}`);
          } catch (error) {
            logger.warn(`Failed to update reactions to checkmark:`, error);
          }
        }
      } else if (data.error) {
        await this.handleError(data);
        
        // Add error reaction to user's message
        try {
          await this.slackClient.reactions.remove({
            channel: data.channelId,
            timestamp: reactionTimestamp,
            name: "gear",
          });
          await this.slackClient.reactions.add({
            channel: data.channelId,
            timestamp: reactionTimestamp,
            name: "x",
          });
          logger.info(`Added error reaction to message ${reactionTimestamp}`);
        } catch (error) {
          logger.warn(`Failed to add error reaction:`, error);
        }
      }

      // Log completion
      if (data.isDone) {
        logger.info(`Thread processing completed for message ${data.messageId}`);
      }

    } catch (error: any) {
      // Check if it's a validation error that shouldn't be retried
      if (error?.data?.error === "invalid_blocks" || 
          error?.data?.error === "msg_too_long" ||
          error?.code === "slack_webapi_platform_error") {
        logger.error(`Slack validation error in job ${job.id}: ${error?.data?.error || error.message}`);
        
        // Try to inform the user about the validation error
        if (data && data.channelId && data.messageId) {
          try {
            await this.slackClient.chat.update({
              channel: data.channelId,
              ts: data.messageId,
              text: `❌ **Message update failed**\n\n**Error:** ${error?.data?.error || error.message}\n\nThe response may contain invalid formatting or be too long for Slack.`
            });
            logger.info(`Notified user about validation error in job ${job.id}`);
          } catch (notifyError) {
            logger.error(`Failed to notify user about validation error: ${notifyError}`);
          }
        }
        
        // Don't throw - mark job as complete to prevent retry loops
        return;
      }
      
      logger.error(`Failed to process thread response job ${job.id}:`, error);
      throw error; // Let pgboss handle retry logic for other errors
    }
  }


  /**
   * Handle message content updates
   */
  private async handleMessageUpdate(data: ThreadResponsePayload): Promise<void> {
    const { content, channelId, threadTs, userId } = data;
    
    if (!content) return;

    try {
      logger.info(`Updating message in channel ${channelId}, thread ${threadTs}`);
      
      // Process markdown and blockkit content
      const result = processMarkdownAndBlockkit(content);
      
      // Get GitHub action links for this session
      const githubActionLinks = await generateGitHubActionButtons(userId, data.gitBranch, this.userMappings, this.repoManager);
      
      // Add GitHub action links to the content
      if (githubActionLinks && githubActionLinks.length > 0) {
        const linksText = `\n\n${githubActionLinks.join(' | ')}`;
        result.text = (result.text || content) + linksText;
        
        // Also add to the last section block if it exists
        const lastSectionBlock = result.blocks.slice().reverse().find(block => block.type === "section" && block.text?.type === "mrkdwn");
        if (lastSectionBlock) {
          lastSectionBlock.text.text += linksText;
        }
      }
      
      // Truncate text to Slack's limit (3000 chars for text field)
      const MAX_TEXT_LENGTH = 3000;
      const truncatedText = (result.text || content).length > MAX_TEXT_LENGTH 
        ? (result.text || content).substring(0, MAX_TEXT_LENGTH - 20) + '\n...[truncated]'
        : (result.text || content);
      
      const updateOptions: any = {
        channel: channelId,
        ts: threadTs,
        text: truncatedText,
        mrkdwn: true,
      };
      
      // Add blocks (always have at least one)
      const MAX_BLOCKS = 50;
      updateOptions.blocks = result.blocks.slice(0, MAX_BLOCKS);
      
      const updateResult = await this.slackClient.chat.update(updateOptions);
      logger.info(`Slack update result: ${updateResult.ok}`);
      
      if (!updateResult.ok) {
        logger.error(`Slack update failed with error: ${updateResult.error}`);
      }

    } catch (error: any) {
      // Handle specific Slack errors
      if (error.code === "message_not_found") {
        logger.error("Slack message not found - it may have been deleted");
      } else if (error.code === "channel_not_found") {
        logger.error("Slack channel not found - bot may not have access");
      } else if (error.code === "not_in_channel") {
        logger.error("Bot is not in the channel");
      } else if (error.data?.error === "invalid_blocks" || error.data?.error === "msg_too_long") {
        // These are Slack validation errors - retrying won't help
        logger.error(`Slack validation error: ${error.data?.error}`);
        
        // Try to send a simple error message instead
        try {
          await this.slackClient.chat.update({
            channel: channelId,
            ts: threadTs,
            text: `❌ **Error occurred while updating message**\n\n**Error:** ${error.data?.error || error.message}\n\nThe response may be too long or contain invalid formatting.`
          });
          logger.info(`Sent fallback error message to user for validation error: ${error.data?.error}`);
        } catch (fallbackError) {
          logger.error("Failed to send fallback error message:", fallbackError);
        }
        // Don't throw - this prevents retry loops for validation errors
      } else {
        logger.error(`Failed to update Slack message: ${error.message}`);
        throw error;
      }
    }
  }

  /**
   * Handle error messages
   */
  private async handleError(data: ThreadResponsePayload): Promise<void> {
    const { error, channelId, threadTs, userId } = data;
    
    if (!error) return;

    try {
      logger.info(`Sending error message to channel ${channelId}, thread ${threadTs}`);
      
      const errorContent = `❌ **Error occurred**\n\n**Error:** \`${error}\``;
      
      // Simple error message
      const errorResult = { 
        text: errorContent, 
        blocks: [{
          type: "section",
          text: {
            type: "mrkdwn",
            text: errorContent
          }
        }]
      };
      
      // Get GitHub action links for this session
      const githubActionLinks = await generateGitHubActionButtons(userId, data.gitBranch, this.userMappings, this.repoManager);
      
      // Add GitHub action links if available
      if (githubActionLinks && githubActionLinks.length > 0) {
        const linksText = `\n\n${githubActionLinks.join(' | ')}`;
        errorResult.text = (errorResult.text || errorContent) + linksText;
        if (errorResult.blocks[0]?.text) {
          errorResult.blocks[0].text.text = errorContent + linksText;
        }
      }
      
      const updateOptions: any = {
        channel: channelId,
        ts: threadTs,
        text: errorResult.text || errorContent,
        mrkdwn: true,
      };
      
      updateOptions.blocks = errorResult.blocks;
      
      const updateResult = await this.slackClient.chat.update(updateOptions);
      logger.info(`Error message update result: ${updateResult.ok}`);

    } catch (updateError: any) {
      logger.error(`Failed to send error message to Slack: ${updateError.message}`);
      throw updateError;
    }
  }

  /**
   * Check if consumer is running and healthy
   */
  isHealthy(): boolean {
    return this.isRunning;
  }

  /**
   * Get current status
   */
  getStatus(): {
    isRunning: boolean;
  } {
    return {
      isRunning: this.isRunning,
    };
  }
}