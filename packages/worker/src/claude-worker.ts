#!/usr/bin/env bun

import { ClaudeSessionRunner } from "@claude-code-slack/core-runner";
import { WorkspaceManager } from "./workspace-setup";
import { QueueIntegration } from "./queue-integration";
import { extractFinalResponse } from "./claude-output-parser";
import type { WorkerConfig } from "./types";
import logger from "./logger";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { dirname, relative } from "node:path";

export class ClaudeWorker {
  private sessionRunner: ClaudeSessionRunner;
  private workspaceManager: WorkspaceManager;
  private queueIntegration: QueueIntegration;
  private config: WorkerConfig;

  constructor(config: WorkerConfig) {
    this.config = config;

    // Initialize components
    this.sessionRunner = new ClaudeSessionRunner();
    this.workspaceManager = new WorkspaceManager(config.workspace);
    
    // Initialize queue integration with database URL
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      const error = new Error("DATABASE_URL environment variable is required");
      logger.error("Failed to initialize QueueIntegration:", error);
      throw error;
    }
    
    this.queueIntegration = new QueueIntegration({
      databaseUrl: databaseUrl,
      responseChannel: config.slackResponseChannel,
      responseTs: config.slackResponseTs,
      messageId: process.env.INITIAL_SLACK_MESSAGE_ID || config.slackResponseTs
    });
  }



  private listMakefilePaths(rootDirectory: string): string[] {
    const foundMakefiles: string[] = [];
    const ignored = new Set([
      "node_modules",
      ".git",
      ".next",
      "dist",
      "build",
      "vendor",
      "target",
      ".venv",
      "venv"
    ]);

    const walk = (dir: string): void => {
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const p = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (ignored.has(entry.name)) continue;
          walk(p);
        } else if (entry.isFile() && entry.name === "Makefile") {
          foundMakefiles.push(p);
        }
      }
    };

    walk(rootDirectory);
    return foundMakefiles;
  }

  private extractMakeTargets(makefileDirectory: string): string[] {
    try {
      const stdout = execSync(`make -C "${makefileDirectory}" -qp`, { stdio: ["ignore", "pipe", "ignore"], encoding: "utf-8" });
      const lineRegex = new RegExp('^[a-zA-Z0-9][^$#\\/\\t%=:]*:([^=]|$)');
      const targets = new Set<string>();
      for (const line of stdout.split("\n")) {
        if (!lineRegex.test(line)) continue;
        const name = line.split(":")[0];
        if (!name || name.startsWith(".")) continue;
        if (name === "Makefile" || name === "makefile" || name === "GNUmakefile") continue;
        targets.add(name);
      }
      return Array.from(targets).sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  }

  private getMakeTargetsSummary(): string {
    const root = `/workspace/${this.config.userId}`;
    const makefiles = this.listMakefilePaths(root);
    if (makefiles.length === 0) return "  - none";

    const lines: string[] = [];
    for (const mf of makefiles) {
      const dir = dirname(mf);
      const rel = relative(root, dir) || ".";
      const targets = this.extractMakeTargets(dir);
      lines.push(`  - ${rel}`);
      if (targets.length === 0) {
        lines.push("    - (none)");
      } else {
        for (const t of targets) lines.push(`    - ${t}`);
      }
    }
    return lines.join("\n");
  }



  /**
   * Execute the worker job
   */
  async execute(): Promise<void> {
    const executeStartTime = Date.now();
    // Original message timestamp available via process.env.ORIGINAL_MESSAGE_TS if needed
    
    try {
      logger.info(`🚀 Starting Claude worker for session: ${this.config.sessionKey} [test-change]`);
      logger.info(`[TIMING] Worker execute() started at: ${new Date(executeStartTime).toISOString()}`);
      
      // Start queue integration
      await this.queueIntegration.start();
      
      // Reactions are now handled by dispatcher based on message isDone status

      // Show stop button when worker starts processing
      this.queueIntegration.showStopButton();
      
      // Decode user prompt first
      const userPrompt = Buffer.from(this.config.userPrompt, "base64").toString("utf-8");
      logger.info(`User prompt: ${userPrompt.substring(0, 100)}...`);
      
      // Update initial message with simple status
      await this.queueIntegration.updateProgress("💻 Setting up workspace...");

      // Setup workspace
      logger.info("Setting up workspace...");
      await this.workspaceManager.setupWorkspace(
        this.config.repositoryUrl,
        this.config.userId,
        this.config.sessionKey
      );
      
      // Create or checkout session branch
      logger.info("Setting up session branch...");
      await this.workspaceManager.createSessionBranch(this.config.sessionKey);
      // Prepare session context
      const sessionContext = {
        platform: "slack" as const,
        channelId: this.config.channelId,
        userId: this.config.userId,
        userDisplayName: this.config.userId,
        threadTs: this.config.threadTs,
        messageTs: this.config.slackResponseTs,
        repositoryUrl: this.config.repositoryUrl,
        workingDirectory: this.workspaceManager.getCurrentWorkingDirectory(),
        customInstructions: this.generateCustomInstructions(),
      };

      // Execute Claude session with conversation history
      logger.info(`[TIMING] Starting Claude session at: ${new Date().toISOString()}`);
      const claudeStartTime = Date.now();
      logger.info(`[TIMING] Total worker startup time: ${claudeStartTime - executeStartTime}ms`);
      
      let firstOutputLogged = false;
      const result = await this.sessionRunner.executeSession({
        sessionKey: this.config.sessionKey,
        userPrompt,
        context: sessionContext,
        options: {
          ...JSON.parse(this.config.claudeOptions),
          resumeSessionId: this.config.resumeSessionId, // Use resumeSessionId if available
        },
        onProgress: async (update) => {
          // Log timing for first output
          if (!firstOutputLogged && update.type === "output") {
            logger.info(`[TIMING] First Claude output at: ${new Date().toISOString()} (${Date.now() - claudeStartTime}ms after Claude start)`);
            firstOutputLogged = true;
            // Update progress to show Claude is now actively working
            await this.queueIntegration.sendTyping();
          }
          // Stream progress via queue
          if (update.type === "output" && update.data) {
            await this.queueIntegration.streamProgress(update.data);
          }
        },
      });

      // Handle final result
      
      logger.info("=== FINAL RESULT DEBUG ===");
      logger.info("result.success:", result.success);
      logger.info("result.output exists:", !!result.output);
      logger.info("result.output length:", result.output?.length);
      logger.info("result.output sample:", result.output?.substring(0, 300));
      logger.info("About to update Slack...");
      
      
      // Do a final push of any remaining changes
      try {
        const status = await this.workspaceManager.getRepositoryStatus();
        if (status.hasChanges) {
          logger.info("Final push: Committing remaining changes...");
          await this.workspaceManager.commitAndPush(
            `Session complete: ${status.changedFiles.length} file(s) modified`
          );
        }
      } catch (pushError) {
        logger.warn("Final push failed:", pushError);
      }

      
      if (result.success) {
        // Update with Claude's response and completion status
        const claudeResponse = this.formatClaudeResponse(result.output);
        
        // IMPORTANT: Always update with a message, even if Claude didn't provide final text
        // This ensures the "thinking" message is replaced
        const finalMessage = claudeResponse && claudeResponse.trim() 
          ? claudeResponse 
          : "✅ Task completed successfully";
        
        logger.info(`Sending final message via queue: ${finalMessage.substring(0, 100)}...`);
        await this.queueIntegration.updateProgress(finalMessage);
        await this.queueIntegration.signalDone(finalMessage);
        
        // Hide stop button and update reaction to success
        this.queueIntegration.hideStopButton();
        
        // Reactions are now handled by dispatcher based on message isDone status
      } else {
        // Hide stop button and show error
        this.queueIntegration.hideStopButton();
        
        const errorMsg = result.error || "Unknown error";
        await this.queueIntegration.updateProgress(
          `❌ Session failed: ${errorMsg}`
        );
        await this.queueIntegration.signalError(new Error(errorMsg));
        
        // Reactions are now handled by dispatcher based on error status
      }

      logger.info(`Worker completed with ${result.success ? "success" : "failure"}`);

    } catch (error) {
      logger.error("Worker execution failed:", error);
      
      // Try to push any pending changes before failing
      try {
        const status = await this.workspaceManager.getRepositoryStatus();
        if (status?.hasChanges) {
          await this.workspaceManager.commitAndPush(
            `Session error: Saving ${status.changedFiles.length} file(s) before exit`
          );
        }
      } catch (pushError) {
        logger.warn("Error push failed:", pushError);
      }
      
      // Try to send error via queue
      try {
        // Hide stop button before showing error
        this.queueIntegration.hideStopButton();
        
        const errorMessage = `💥 Worker crashed: ${error instanceof Error ? error.message : "Unknown error"}`;
        await this.queueIntegration.updateProgress(errorMessage);
        await this.queueIntegration.signalError(error instanceof Error ? error : new Error("Unknown error"));
        
        // Reactions are now handled by dispatcher based on error status
      } catch (queueError) {
        logger.error("Failed to send error via queue:", queueError);
      }

      // Re-throw to ensure container exits with error code
      throw error;
    }
  }

  /**
   * Generate custom instructions for Claude
   */
  private generateCustomInstructions(): string {
    return `
You are a helpful Claude Code agent running in a pod on K8S for user ${this.config.userId}. 
You MUST generate Markdown content that will be rendered in user's messaging app. 

**Code Block Actions:**
You can add action metadata to code blocks to create interactive buttons. 
The metadata goes in the fence info, NOT in the content.
Only use it to run commands and programs, not to create forms or links.
IMPORTANT: Code blocks with action metadata MUST be less than 2000 characters. Longer code blocks will be skipped and won't create buttons.

**Examples:**

\`\`\`bash { action: "Deploy App", confirm: true, show: true }
#!/bin/bash
npm run build
docker build -t myapp .
\`\`\`

\`\`\`blockkit { action: "Configure Settings", confirm: false, show: false }
{
  "blocks": [
    {
      "type": "input",
      "element": {
        "type": "plain_text_input",
        "action_id": "name_input"
      },
      "label": {
        "type": "plain_text",
        "text": "Project Name"
      }
    }
  ]
}
\`\`\`

**CRITICAL FOR BLOCKKIT FORMS:**
- ALWAYS include action metadata: \`{ action: "Button Name", confirm: false, show: false }\`
- NEVER use plain \`\`\`blockkit without metadata
- Forms without action metadata will NOT work properly

**Environment:**
- Repo: ${this.config.repositoryUrl}
- Session: ${this.config.sessionKey}
- Makefile directories and targets (indicating projects):
${this.getMakeTargetsSummary()}

**Guidelines:**
- Branch: claude/${this.config.sessionKey.replace(/\./g, "-")}
- IMPORTANT: After making any code changes, you MUST commit and push them using git commands (git add, git commit, git push).
- Push only to this branch (no PR creation, the user has to create PR manually).
- Focus on the user's request.
- Always prefer numbered lists over bullet points.

**Instructions:**
1. New project: create a folder in the current directory; ask for name, tech stack (dbname,providername,apiservicename etc.) in a form and autopopulate if provided. Collect secrets if needed. Deployment types are Node.js/bun, Python/uv, Docker, Docker Compose, Cloudflare (install flarectl and ask for personal access token.).
2. Feature/bug: if no Makefile in current dir, show a dropdown of folders containing a Makefile in a form; user selects one; set the current directory to the selected folder.
3. Secrets: if required, collect values via form and map to .env file before running make commands.
4. New persona: If the user says he wants to create subagent/persona, create a Claude subagent on .claude/agents/agent-name.md and in there add it's traits based on the form values the user enters.
5. If the user wants to remember something, add it to CLAUDE.md file.
6. If the user wants to create an action, create a new file in .claude/actions/action-name.md and in there add the action's traits based on the form values the user enters.

}.`
.trim();
  }


  private formatClaudeResponse(output: string | undefined): string {
    logger.info("=== formatClaudeResponse DEBUG ===");
    logger.info(`output exists? ${!!output}`);
    logger.info(`output length: ${output?.length}`);
    logger.info(`output first 200 chars: ${output?.substring(0, 200)}`);
    
    if (!output) {
      return "";
    }
    
    const extracted = extractFinalResponse(output);
    logger.info(`extracted response: ${extracted}`);
    logger.info(`extracted length: ${extracted.length}`);
    
    // Return the raw extracted markdown - slack-integration will handle conversion
    return extracted || "";
  }

  /**
   * Cleanup worker resources
   */
  async cleanup(): Promise<void> {
    try {
      logger.info("Cleaning up worker resources...");
      
      // Cleanup queue integration
      this.queueIntegration.cleanup();
      await this.queueIntegration.stop();
      
      // Cleanup session runner
      await this.sessionRunner.cleanupSession(this.config.sessionKey);
      
      // Cleanup workspace (this also does a final commit/push)
      await this.workspaceManager.cleanup();
      
      logger.info("Worker cleanup completed");
    } catch (error) {
      logger.error("Error during cleanup:", error);
    }
  }
}

export type { WorkerConfig } from "./types";