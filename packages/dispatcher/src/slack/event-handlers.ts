#!/usr/bin/env bun

import type { App } from "@slack/bolt";
import type { GitHubRepositoryManager } from "../github/repository-manager";
import type { 
  DispatcherConfig, 
  SlackContext, 
  ThreadSession
} from "../types";
import { QueueProducer, type WorkerDeploymentPayload, type ThreadMessagePayload } from "../queue/queue-producer";
import { SessionManager } from "@claude-code-slack/core-runner";
import logger from "../logger";

/**
 * Queue-based Slack event handlers that replace direct Kubernetes job creation
 * Routes messages to appropriate queues based on conversation state
 */
export class SlackEventHandlers {
  private activeSessions = new Map<string, ThreadSession>();
  private userMappings = new Map<string, string>(); // slackUserId -> githubUsername
  private repositoryCache = new Map<string, { repository: any; timestamp: number }>(); // username -> {repository, timestamp}
  private sessionMappings = new Map<string, string>(); // sessionKey -> agentSessionId
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

  constructor(
    private app: App,
    private queueProducer: QueueProducer,
    private repoManager: GitHubRepositoryManager,
    private config: DispatcherConfig
  ) {
    this.setupEventHandlers();
    this.startCachePrewarming();
  }

  /**
   * Get bot ID from configuration
   */
  private getBotId(): string {
    return this.config.slack.botId || "default-slack-bot";
  }


  /**
   * Setup Slack event handlers
   */
  private setupEventHandlers(): void {
    logger.info("Setting up Queue-based Slack event handlers...");
    
    // Handle app mentions
    this.app.event("app_mention", async ({ event, client, say }) => {
      const handlerStartTime = Date.now();
      logger.info("=== APP_MENTION HANDLER TRIGGERED (QUEUE) ===");
      logger.info(`[TIMING] Handler triggered at: ${new Date(handlerStartTime).toISOString()}`);
      
      try {
        const context = this.extractSlackContext(event);
        
        if (!context.userId) {
          logger.error("No user ID found in app_mention event");
          await say({
            thread_ts: context.threadTs,
            text: "❌ Error: Unable to identify user. Please try again.",
          });
          return;
        }
        
        
        if (!this.isUserAllowed(context.userId)) {
          await say({
            thread_ts: context.threadTs,
            text: "Sorry, you don't have permission to use this bot.",
          });
          return;
        }

        const userRequest = this.extractUserRequest(context.text);
        await this.handleUserRequest(context, userRequest, client);
        
      } catch (error) {
        logger.error("Error handling app mention:", error);
        
        try {
          await client.reactions.add({
            channel: event.channel,
            timestamp: event.ts,
            name: "x",
          });
        } catch (reactionError) {
          logger.error("Failed to add error reaction:", reactionError);
        }
        
        await say({
          thread_ts: event.thread_ts,
          text: `❌ Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
        });
      }
    });

    // Handle direct messages
    this.app.message(async ({ message, client, say }) => {
      logger.info("=== MESSAGE HANDLER TRIGGERED (QUEUE) ===");
      
      // Skip our own bot's messages
      const botUserId = this.config.slack.botUserId;
      const botId = this.config.slack.botId;
      if ((message as any).user === botUserId || (message as any).bot_id === botId) {
        logger.debug(`Skipping our own bot's message`);
        return;
      }
      
      // Skip channel messages with bot mentions (handled by app_mention)
      const messageText = (message as any).text || '';
      if (message.channel_type === 'channel' && messageText.includes(`<@${botUserId}>`)) {
        logger.debug("Skipping channel message with bot mention - handled by app_mention");
        return;
      }
      
      const ignoredSubtypes = [
        'message_changed',
        'message_deleted', 
        'thread_broadcast',
        'channel_join',
        'channel_leave',
        'assistant_app_thread'
      ];
      
      if (message.subtype && ignoredSubtypes.includes(message.subtype)) {
        logger.debug(`Ignoring message with subtype: ${message.subtype}`);
        return;
      }
      
      try {
        const context = this.extractSlackContext(message);
        
        if (!context.userId) {
          logger.error("No user ID found in message event");
          await say("❌ Error: Unable to identify user. Please try again.");
          return;
        }
        
        
        if (!this.isUserAllowed(context.userId)) {
          await say("Sorry, you don't have permission to use this bot.");
          return;
        }

        const userRequest = this.extractUserRequest(context.text);
        await this.handleUserRequest(context, userRequest, client);
        
      } catch (error) {
        logger.error("Error handling direct message:", error);
        await say(`❌ Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`);
      }
    });

    // Handle view submissions (dialog/modal submissions)
    this.app.view(/.*/, async ({ ack, body, view, client }) => {
      logger.info("=== VIEW SUBMISSION HANDLER TRIGGERED (QUEUE) ===");
      await ack();
      
      try {
        const userId = body.user.id;
        const metadata = view.private_metadata ? JSON.parse(view.private_metadata) : {};
        
        // Handle repository override modal specifically
        if (view.callback_id === 'repository_override_modal') {
          await this.handleRepositoryOverrideSubmission(userId, view, client);
          return;
        }
        
        // Handle blockkit form modal submissions
        if (view.callback_id === 'blockkit_form_modal') {
          await this.handleBlockkitFormSubmission(userId, view, client);
          return;
        }
        
        const channelId = metadata.channel_id;
        const threadTs = metadata.thread_ts;
        const userInput = this.extractViewInputs(view.state.values);
        
        if (channelId && threadTs) {
          const buttonText = metadata.button_text || 
                            (metadata.action_id ? metadata.action_id.replace(/_/g, ' ') : null) || 
                            view.callback_id?.replace(/_/g, ' ') || 
                            'Form';
          
          const formattedInput = `> 📝 *Form submitted from "${buttonText}" button*\n\n${userInput}`;
          
          const inputMessage = await client.chat.postMessage({
            channel: channelId,
            thread_ts: threadTs,
            text: formattedInput,
            blocks: [
              {
                type: "context",
                elements: [
                  {
                    type: "mrkdwn",
                    text: `<@${userId}> submitted form`
                  }
                ]
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: userInput
                }
              }
            ]
          });
          
          const context = {
            channelId,
            userId,
            userDisplayName: body.user.name || 'Unknown User',
            teamId: body.team?.id || '',
            messageTs: inputMessage.ts as string,
            threadTs: threadTs,
            text: userInput,
          };
          
          await this.handleUserRequest(context, userInput, client);
        }
        
      } catch (error) {
        logger.error("Error handling view submission:", error);
      }
    });

    // Handle interactive actions (button clicks, select menus, etc.)
    this.app.action(/.*/, async ({ action, ack, client, body }) => {
      logger.info("=== ACTION HANDLER TRIGGERED (QUEUE) ===");
      await ack();
      
      try {
        const actionId = (action as any).action_id;
        const userId = body.user.id;
        const channelId = (body as any).channel?.id || (body as any).container?.channel_id;
        const messageTs = (body as any).message?.ts || (body as any).container?.message_ts;
        
        if (!this.isUserAllowed(userId)) {
          await client.chat.postEphemeral({
            channel: channelId,
            user: userId,
            text: "Sorry, you don't have permission to use this action.",
          });
          return;
        }
        
        await this.handleBlockAction(actionId, userId, channelId, messageTs, body, client);
        
      } catch (error) {
        logger.error("Error handling action:", error);
        
        const userId = body.user.id;
        const channelId = (body as any).channel?.id || (body as any).container?.channel_id;
        
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: `❌ Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
        });
      }
    });

    // Handle app home opened events
    this.app.event("app_home_opened", async ({ event, client }) => {
      logger.info("=== APP_HOME_OPENED HANDLER TRIGGERED (QUEUE) ===");
      
      try {
        if (event.tab === "home") {
          await this.updateAppHome(event.user, client);
        }
      } catch (error) {
        logger.error("Error handling app home opened:", error);
      }
    });
  }

  /**
   * Handle user request by routing to appropriate queue
   */
  private async handleUserRequest(
    context: SlackContext,
    userRequest: string,
    client: any
  ): Promise<void> {
    const requestStartTime = Date.now();
    logger.info(`[TIMING] handleUserRequest started at: ${new Date(requestStartTime).toISOString()}`);
    
    // Normalize threadTs BEFORE session key generation to ensure consistency
    // If this is not already a thread, use the current message timestamp as thread_ts
    const normalizedThreadTs = context.threadTs || context.messageTs;
    
    // Generate session key with normalized threadTs
    const sessionKey = SessionManager.generateSessionKey({
      platform: "slack",
      channelId: context.channelId,
      userId: context.userId,
      userDisplayName: context.userDisplayName,
      teamId: context.teamId,
      threadTs: normalizedThreadTs,
      messageTs: context.messageTs,
    });

    logger.info(`Handling request for session: ${sessionKey} (threadTs: ${normalizedThreadTs})`);

    // Check if session is already active
    const existingSession = this.activeSessions.get(sessionKey);
    if (existingSession && existingSession.status === "running") {
      await client.chat.postMessage({
        channel: context.channelId,
        thread_ts: normalizedThreadTs,
        text: "⏳ I'm already working on this thread. Please wait for the current task to complete.",
        mrkdwn: true,
      });
      return;
    }

    try {
      // Get user's GitHub username mapping
      const username = await this.getOrCreateUserMapping(context.userId, client);
      
      // Check if we have an existing Claude session for this thread
      const existingClaudeSessionId = await this.loadSessionMapping(username, sessionKey);
      
      // Check repository cache first
      let repository;
      const cachedRepo = this.repositoryCache.get(username);
      if (cachedRepo && Date.now() - cachedRepo.timestamp < this.CACHE_TTL) {
        repository = cachedRepo.repository;
        logger.info(`Using cached repository for ${username}`);
      } else {
        repository = await this.repoManager.ensureUserRepository(username);
        this.repositoryCache.set(username, { repository, timestamp: Date.now() });
      }
      
      // Use the normalized threadTs
      const threadTs = normalizedThreadTs;
      
      // Create thread session
      const threadSession: ThreadSession = {
        sessionKey,
        threadTs: threadTs,
        channelId: context.channelId,
        userId: context.userId,
        username,
        repositoryUrl: repository.repositoryUrl,
        agentSessionId: existingClaudeSessionId,
        lastActivity: Date.now(),
        status: "pending",
        createdAt: Date.now(),
      };

      this.activeSessions.set(sessionKey, threadSession);

      // Post initial Slack response
      logger.info(`[TIMING] Posting initial response at: ${new Date().toISOString()}`);
      const initialResponse = await client.chat.postMessage({
        channel: context.channelId,
        thread_ts: threadTs,
        text: "🚀 Starting environment setup...",
      });

      // Determine if this is a new conversation or continuation
      const isNewConversation = !context.threadTs;
      
      if (isNewConversation) {
        const deploymentPayload: WorkerDeploymentPayload = {
          userId: context.userId,
          botId: this.getBotId(),
          agentSessionId: existingClaudeSessionId || sessionKey,
          threadId: threadTs,
          platform: "slack",
          platformUserId: context.userId,
          messageId: context.messageTs,
          messageText: userRequest,
          channelId: context.channelId,
          platformMetadata: {
            teamId: context.teamId,
            userDisplayName: context.userDisplayName,
            repositoryUrl: repository.repositoryUrl,
            slackResponseChannel: context.channelId,
            slackResponseTs: initialResponse.ts,
            originalMessageTs: context.messageTs,
          },
          claudeOptions: {
            allowedTools: this.config.claude.allowedTools,
            model: this.config.claude.model,
            timeoutMinutes: this.config.sessionTimeoutMinutes.toString(),
            resumeSessionId: existingClaudeSessionId,
          },
        };

        const jobId = await this.queueProducer.enqueueWorkerDeployment(deploymentPayload);

        logger.info(`Enqueued direct message job ${jobId} for session ${sessionKey}`);
        threadSession.status = "pending";
        
      } else {
        // Enqueue to user-specific queue (worker should already exist)
        const threadPayload: ThreadMessagePayload = {
          botId: this.getBotId(),
          userId: context.userId,
          threadId: threadTs,
          platform: "slack",
          channelId: context.channelId,
          messageId: context.messageTs,
          messageText: userRequest,
          agentSessionId: existingClaudeSessionId,
          platformMetadata: {
            teamId: context.teamId,
            userDisplayName: context.userDisplayName,
            repositoryUrl: repository.repositoryUrl,
            slackResponseChannel: context.channelId,
            slackResponseTs: initialResponse.ts,
            originalMessageTs: context.messageTs,
          },
          claudeOptions: {
            ...this.config.claude,
            timeoutMinutes: this.config.sessionTimeoutMinutes.toString(),
          },
          // Add routing metadata for thread-specific processing
          routingMetadata: {
            targetThreadId: threadTs,
            agentSessionId: existingClaudeSessionId || sessionKey,
            userId: context.userId
          }
        };

        const jobId = await this.queueProducer.enqueueThreadMessage(threadPayload);

        logger.info(`Enqueued thread message job ${jobId} for session ${sessionKey}`);
        threadSession.status = "pending";
      }

    } catch (error) {
      logger.error(`Failed to handle request for session ${sessionKey}:`, error);
      
      // Try to update reaction to error
      try {
        await client.reactions.remove({
          channel: context.channelId,
          timestamp: context.messageTs,
          name: "eyes",
        });
        await client.reactions.add({
          channel: context.channelId,
          timestamp: context.messageTs,
          name: "x",
        });
      } catch (reactionError) {
        logger.error("Failed to update error reaction:", reactionError);
      }
      
      const errorMessage = `❌ *Error:* ${error instanceof Error ? error.message : "Unknown error occurred"}`;
      
      // Post error message in thread
      const threadTs = context.threadTs || context.messageTs;
      await client.chat.postMessage({
        channel: context.channelId,
        thread_ts: threadTs,
        text: errorMessage,
        mrkdwn: true,
      });
      
      // Clean up session
      this.activeSessions.delete(sessionKey);
    }
  }

  /**
   * Extract Slack context from event
   */
  private extractSlackContext(event: any): SlackContext {
    return {
      channelId: event.channel,
      userId: event.user,
      teamId: event.team || "",
      threadTs: event.thread_ts,
      messageTs: event.ts,
      text: event.text || "",
      userDisplayName: event.user_profile?.display_name || "Unknown User",
    };
  }

  /**
   * Extract user request from mention text
   */
  private extractUserRequest(text: string): string {
    let cleaned = text.replace(/<@[^>]+>/g, "").trim();
    
    if (!cleaned) {
      return "Hello! How can I help you today?";
    }
    
    return cleaned;
  }

  /**
   * Check if user is allowed to use the bot
   */
  private isUserAllowed(userId: string): boolean {
    const { allowedUsers, blockedUsers } = this.config.slack;
    
    if (blockedUsers?.includes(userId)) {
      return false;
    }
    
    if (allowedUsers && allowedUsers.length > 0) {
      return allowedUsers.includes(userId);
    }
    
    return true;
  }

  /**
   * Load previously stored Claude session mapping for a thread
   * Currently uses in-memory map but can be extended to persistent storage
   */
  private async loadSessionMapping(
    _username: string,
    sessionKey: string,
  ): Promise<string | undefined> {
    return this.sessionMappings.get(sessionKey);
  }

  private async getOrCreateUserMapping(slackUserId: string, client: any): Promise<string> {
    const existingMapping = this.userMappings.get(slackUserId);
    if (existingMapping) {
      return existingMapping;
    }

    try {
      const userInfo = await client.users.info({ user: slackUserId });
      const user = userInfo.user;
      
      let username = user.profile?.display_name || user.profile?.real_name || user.name;
      username = username.toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      
      username = `user-${username}`;
      this.userMappings.set(slackUserId, username);
      
      logger.info(`Created user mapping: ${slackUserId} -> ${username}`);
      return username;
      
    } catch (error) {
      logger.error(`Failed to get user info for ${slackUserId}:`, error);
      const fallbackUsername = slackUserId ? `user-${slackUserId.substring(0, 8)}` : "user-unknown";
      if (slackUserId) {
        this.userMappings.set(slackUserId, fallbackUsername);
      }
      return fallbackUsername;
    }
  }

  private startCachePrewarming(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [username, cached] of this.repositoryCache.entries()) {
        if (now - cached.timestamp > this.CACHE_TTL) {
          this.repositoryCache.delete(username);
          logger.info(`Evicted stale repository cache for ${username}`);
        }
      }
    }, 60000);
  }

  private async handleBlockAction(
    actionId: string,
    userId: string,
    channelId: string,
    messageTs: string,
    body: any,
    client: any
  ): Promise<void> {
    logger.info(`Handling block action: ${actionId}`);

    switch (actionId) {
      case "open_repository_override_modal":
        await client.views.open({
          trigger_id: body.trigger_id,
          view: {
            type: "modal",
            callback_id: "repository_override_modal",
            private_metadata: JSON.stringify({
              channel_id: channelId,
              thread_ts: messageTs,
            }),
            title: { type: "plain_text", text: "Repository" },
            submit: { type: "plain_text", text: "Save" },
            close: { type: "plain_text", text: "Cancel" },
            blocks: [
              {
                type: "input",
                block_id: "repo_input",
                label: { type: "plain_text", text: "Repository URL" },
                element: {
                  type: "plain_text_input",
                  action_id: "repo_url",
                  placeholder: { type: "plain_text", text: "https://github.com/user/repo" },
                },
              },
            ],
          },
        });
        break;

      default:
        // Handle blockkit form button clicks
        if (actionId.startsWith("blockkit_form_")) {
          await this.handleBlockkitForm(actionId, userId, channelId, messageTs, body, client);
        }
        // Handle executable code block buttons (bash, python, etc.)
        else if (actionId.match(/^(bash|python|javascript|js|typescript|ts|sql|sh)_/)) {
          await this.handleExecutableCodeBlock(actionId, userId, channelId, messageTs, body, client);
        }
        // Handle stop worker button clicks
        else if (actionId.startsWith("stop_worker_")) {
          const deploymentName = actionId.replace("stop_worker_", "");
          await this.handleStopWorker(deploymentName, userId, channelId, messageTs, client);
        } else {
          // Log unsupported actions but don't send messages to users
          logger.info(`Unsupported action: ${actionId} from user ${userId} in channel ${channelId}`);
          // Silently acknowledge - no user notification needed
        }
    }
  }

  /**
   * Handle executable code block button clicks
   * Sends the code content back to Claude for execution
   */
  private async handleExecutableCodeBlock(
    actionId: string,
    userId: string,
    channelId: string,
    messageTs: string,
    body: any,
    client: any
  ): Promise<void> {
    logger.info(`Handling executable code block: ${actionId}`);

    try {
      // Extract the code from the button's value
      const action = (body as any).actions?.[0];
      if (!action?.value) {
        throw new Error("No code content found in button");
      }

      const codeContent = action.value;
      const language = actionId.split('_')[0]; // Extract language from action_id
      const buttonText = action.text?.text || `Run ${language}`;

      // Post the code execution request as a user message
      const formattedInput = `> 🚀 *Executed "${buttonText}" button*\n\n\`\`\`${language}\n${codeContent}\n\`\`\``;
      
      const inputMessage = await client.chat.postMessage({
        channel: channelId,
        thread_ts: messageTs,
        text: formattedInput,
        blocks: [
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `<@${userId}> executed "${buttonText}" button`
              }
            ]
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `\`\`\`${language}\n${codeContent}\n\`\`\``
            }
          }
        ]
      });
      
      const context = {
        channelId,
        userId,
        userDisplayName: 'Unknown User', // TODO: Get from user info
        teamId: '', // TODO: Get from body
        messageTs: inputMessage.ts as string,
        threadTs: messageTs,
        text: formattedInput,
      };
      
      await this.handleUserRequest(context, formattedInput, client);
      
    } catch (error) {
      logger.error(`Failed to handle executable code block ${actionId}:`, error);
      
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: `❌ Failed to execute code: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  /**
   * Handle blockkit form button clicks
   * Opens a modal with the blockkit form content
   */
  private async handleBlockkitForm(
    actionId: string,
    userId: string,
    channelId: string,
    messageTs: string,
    body: any,
    client: any
  ): Promise<void> {
    logger.info(`Handling blockkit form: ${actionId}`);

    try {
      // Extract the blocks from the button's value
      const action = (body as any).actions?.[0];
      if (!action?.value) {
        throw new Error("No form data found in button");
      }

      const formData = JSON.parse(action.value);
      const blocks = formData.blocks || [];

      if (blocks.length === 0) {
        throw new Error("No blocks found in form data");
      }

      // Create modal with the blockkit form
      await client.views.open({
        trigger_id: body.trigger_id,
        view: {
          type: "modal",
          callback_id: "blockkit_form_modal",
          private_metadata: JSON.stringify({
            channel_id: channelId,
            thread_ts: messageTs,
            action_id: actionId,
            button_text: action.text?.text || "Form"
          }),
          title: { type: "plain_text", text: action.text?.text || "Form" },
          submit: { type: "plain_text", text: "Submit" },
          close: { type: "plain_text", text: "Cancel" },
          blocks: blocks
        },
      });

    } catch (error) {
      logger.error(`Failed to handle blockkit form ${actionId}:`, error);
      
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: `❌ Failed to open form: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  /**
   * Handle stop worker button clicks
   * Scales the deployment to 0 to stop the Claude worker
   */
  private async handleStopWorker(
    deploymentName: string,
    userId: string,
    channelId: string,
    messageTs: string,
    client: any
  ): Promise<void> {
    logger.info(`Handling stop worker request for deployment: ${deploymentName}`);

    try {
      // Make API call to orchestrator to scale deployment to 0
      const orchestratorUrl = process.env.ORCHESTRATOR_URL || 'http://peerbot-orchestrator:8080';
      const response = await fetch(`${orchestratorUrl}/scale/${deploymentName}/0`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestedBy: userId,
          reason: 'User requested stop via Slack button'
        })
      });

      if (response.ok) {
        // Success - notify user
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: `✅ Claude worker stopped successfully. The deployment "${deploymentName}" has been scaled to 0.`,
        });

        // Update the original message to remove the stop button
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          text: "Claude worker has been stopped by user request.",
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "🛑 *Claude worker stopped by user request*"
              }
            }
          ]
        });

      } else {
        const errorText = await response.text();
        throw new Error(`Orchestrator responded with ${response.status}: ${errorText}`);
      }

    } catch (error) {
      logger.error(`Failed to stop worker for deployment ${deploymentName}:`, error);
      
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: `❌ Failed to stop Claude worker: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  private async updateAppHome(userId: string, client: any): Promise<void> {
    logger.info(`Updating app home for user: ${userId}`);
    const homeView = {
      type: "home",
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: "Welcome to Claude Code!" },
        },
      ],
    };

    await client.views.publish({ user_id: userId, view: homeView });
  }

  private async handleBlockkitFormSubmission(
    userId: string,
    view: any,
    client: any
  ): Promise<void> {
    logger.info(`Handling blockkit form submission for user: ${userId}`);

    const metadata = view.private_metadata ? JSON.parse(view.private_metadata) : {};
    const channelId = metadata.channel_id;
    const threadTs = metadata.thread_ts;
    const buttonText = metadata.button_text || 'Form';
    
    if (!channelId || !threadTs) {
      logger.error("Missing channel or thread information in blockkit form submission");
      return;
    }

    const userInput = this.extractViewInputs(view.state.values);
    
    if (!userInput.trim()) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "Please fill out the form before submitting.",
      });
      return;
    }

    try {
      const formattedInput = `> 📝 *Form submitted from "${buttonText}" button*\n\n${userInput}`;
      
      const inputMessage = await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: formattedInput,
        blocks: [
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `<@${userId}> submitted form from "${buttonText}" button`
              }
            ]
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: userInput
            }
          }
        ]
      });
      
      const context = {
        channelId,
        userId,
        userDisplayName: metadata.user_display_name || 'Unknown User',
        teamId: metadata.team_id || '',
        messageTs: inputMessage.ts as string,
        threadTs: threadTs,
        text: userInput,
      };
      
      await this.handleUserRequest(context, userInput, client);
      
    } catch (error) {
      logger.error(`Failed to handle blockkit form submission:`, error);
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: `❌ Failed to process form submission: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  private async handleRepositoryOverrideSubmission(
    userId: string,
    view: any,
    client: any
  ): Promise<void> {
    logger.info(`Handling repository override submission for user: ${userId}`);

    const repoUrl = view.state.values?.repo_input?.repo_url?.value?.trim();
    const metadata = view.private_metadata ? JSON.parse(view.private_metadata) : {};
    const channelId = metadata.channel_id;
    const threadTs = metadata.thread_ts;

    if (!repoUrl) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "Please provide a repository URL.",
      });
      return;
    }

    const username = await this.getOrCreateUserMapping(userId, client);
    
    // Update memory cache
    try {
      // Also update memory cache for immediate use
      this.repositoryCache.set(username, {
        repository: { repositoryUrl: repoUrl },
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error(`Failed to save repository URL for ${username}:`, error);
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "❌ Failed to save repository URL. Please try again.",
      });
      return;
    }

    if (channelId && threadTs) {
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: `✅ Repository set to ${repoUrl}`,
      });
    }
  }

  private extractViewInputs(stateValues: any): string {
    const inputs: string[] = [];
    for (const [blockId, block] of Object.entries(stateValues || {})) {
      for (const [actionId, action] of Object.entries(block as any)) {
        let value = "";
        
        // Handle different types of Slack form inputs
        if ((action as any).value) {
          value = (action as any).value;
        } else if ((action as any).selected_option?.value) {
          value = (action as any).selected_option.value;
        } else if ((action as any).selected_options) {
          // Multi-select
          const options = (action as any).selected_options;
          value = options.map((opt: any) => opt.value).join(", ");
        } else if ((action as any).selected_date) {
          value = (action as any).selected_date;
        } else if ((action as any).selected_time) {
          value = (action as any).selected_time;
        }
        
        if (value && value.toString().trim()) {
          // Use actionId as label if available, otherwise use blockId
          const label = actionId || blockId;
          // Convert snake_case or camelCase to readable format
          const readableLabel = label
            .replace(/[_-]/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          
          inputs.push(`*${readableLabel}:* ${value}`);
        }
      }
    }
    return inputs.join("\n");
  }

  /**
   * Get active sessions for monitoring
   */
  getActiveSessions(): ThreadSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get session count
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Get user mappings (for thread response consumer)
   */
  getUserMappings(): Map<string, string> {
    return this.userMappings;
  }


  /**
   * Cleanup all sessions
   */
  async cleanup(): Promise<void> {
    this.activeSessions.clear();
    this.userMappings.clear();
    this.repositoryCache.clear();
  }
}