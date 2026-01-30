import * as core from "@actions/core";
import { mkdir, writeFile } from "fs/promises";
import type { Mode, ModeOptions, ModeResult } from "../types";
import type { PreparedContext } from "../../create-prompt/types";
import { prepareMcpConfig } from "../../mcp/install-mcp-server";
import { parseAllowedTools } from "./parse-tools";
import {
  configureGitAuth,
  setupSshSigning,
} from "../../github/operations/git-config";
import { checkHumanActor } from "../../github/validation/actor";
import type { GitHubContext } from "../../github/context";
import { isEntityContext } from "../../github/context";

/**
 * Extract GitHub context as environment variables for agent mode
 */
function extractGitHubContext(context: GitHubContext): Record<string, string> {
  const envVars: Record<string, string> = {};

  // Basic repository info
  envVars.GITHUB_REPOSITORY = context.repository.full_name;
  envVars.GITHUB_TRIGGER_ACTOR = context.actor;
  envVars.GITHUB_EVENT_NAME = context.eventName;

  // Entity-specific context (PR/issue numbers, branches, etc.)
  if (isEntityContext(context)) {
    if (context.isPR) {
      envVars.GITHUB_PR_NUMBER = String(context.entityNumber);

      // Extract branch info from payload if available
      if (
        context.payload &&
        "pull_request" in context.payload &&
        context.payload.pull_request
      ) {
        envVars.GITHUB_BASE_REF = context.payload.pull_request.base?.ref || "";
        envVars.GITHUB_HEAD_REF = context.payload.pull_request.head?.ref || "";
      }
    } else {
      envVars.GITHUB_ISSUE_NUMBER = String(context.entityNumber);
    }
  }

  return envVars;
}

/**
 * Agent mode implementation.
 *
 * This mode runs whenever an explicit prompt is provided in the workflow configuration.
 * It bypasses the standard @claude mention checking and comment tracking used by tag mode,
 * providing direct access to Claude Code for automation workflows.
 */
export const agentMode: Mode = {
  name: "agent",
  description: "Direct automation mode for explicit prompts",

  shouldTrigger(context) {
    // Only trigger when an explicit prompt is provided
    return !!context.inputs?.prompt;
  },

  prepareContext(context) {
    // Agent mode doesn't use comment tracking or branch management
    return {
      mode: "agent",
      githubContext: context,
    };
  },

  getAllowedTools() {
    return [];
  },

  getDisallowedTools() {
    return [];
  },

  shouldCreateTrackingComment() {
    return false;
  },

  async prepare({
    context,
    octokit,
    githubToken,
  }: ModeOptions): Promise<ModeResult> {
    // Check if actor is human (prevents bot-triggered loops)
    await checkHumanActor(octokit.rest, context);

    // Configure git authentication for agent mode (same as tag mode)
    // SSH signing takes precedence if provided
    const useSshSigning = !!context.inputs.sshSigningKey;
    const useApiCommitSigning =
      context.inputs.useCommitSigning && !useSshSigning;

    if (useSshSigning) {
      // Setup SSH signing for commits
      await setupSshSigning(context.inputs.sshSigningKey);

      // Still configure git auth for push operations (user/email and remote URL)
      const user = {
        login: context.inputs.botName,
        id: parseInt(context.inputs.botId),
      };
      try {
        await configureGitAuth(githubToken, context, user);
      } catch (error) {
        console.error("Failed to configure git authentication:", error);
        // Continue anyway - git operations may still work with default config
      }
    } else if (!useApiCommitSigning) {
      // Use bot_id and bot_name from inputs directly
      const user = {
        login: context.inputs.botName,
        id: parseInt(context.inputs.botId),
      };

      try {
        // Use the shared git configuration function
        await configureGitAuth(githubToken, context, user);
      } catch (error) {
        console.error("Failed to configure git authentication:", error);
        // Continue anyway - git operations may still work with default config
      }
    }

    // Create prompt directory
    await mkdir(`${process.env.RUNNER_TEMP || "/tmp"}/claude-prompts`, {
      recursive: true,
    });

    // Write the prompt file - use the user's prompt directly
    const promptContent =
      context.inputs.prompt ||
      `Repository: ${context.repository.owner}/${context.repository.repo}`;

    await writeFile(
      `${process.env.RUNNER_TEMP || "/tmp"}/claude-prompts/claude-prompt.txt`,
      promptContent,
    );

    // Parse allowed tools from user's claude_args
    const userClaudeArgs = process.env.CLAUDE_ARGS || "";
    const allowedTools = parseAllowedTools(userClaudeArgs);

    // Check for branch info from environment variables (useful for auto-fix workflows)
    const claudeBranch = process.env.CLAUDE_BRANCH || undefined;
    const baseBranch =
      process.env.BASE_BRANCH || context.inputs.baseBranch || "main";

    // Detect current branch from GitHub environment
    const currentBranch =
      claudeBranch ||
      process.env.GITHUB_HEAD_REF ||
      process.env.GITHUB_REF_NAME ||
      "main";

    // Get our GitHub MCP servers config
    const ourMcpConfig = await prepareMcpConfig({
      githubToken,
      owner: context.repository.owner,
      repo: context.repository.repo,
      branch: currentBranch,
      baseBranch: baseBranch,
      claudeCommentId: undefined, // No tracking comment in agent mode
      allowedTools,
      mode: "agent",
      context,
    });

    // Build final claude_args with multiple --mcp-config flags
    let claudeArgs = "";

    // Add our GitHub servers config if we have any
    const ourConfig = JSON.parse(ourMcpConfig);
    if (ourConfig.mcpServers && Object.keys(ourConfig.mcpServers).length > 0) {
      const escapedOurConfig = ourMcpConfig.replace(/'/g, "'\\''");
      claudeArgs = `--mcp-config '${escapedOurConfig}'`;
    }

    // Append user's claude_args (which may have more --mcp-config flags)
    claudeArgs = `${claudeArgs} ${userClaudeArgs}`.trim();

    core.setOutput("claude_args", claudeArgs);

    return {
      commentId: undefined,
      branchInfo: {
        baseBranch: baseBranch,
        currentBranch: baseBranch, // Use base branch as current when creating new branch
        claudeBranch: claudeBranch,
      },
      mcpConfig: ourMcpConfig,
    };
  },

  generatePrompt(context: PreparedContext): string {
    // Inject GitHub context as environment variables
    if (context.githubContext) {
      const envVars = extractGitHubContext(context.githubContext);
      for (const [key, value] of Object.entries(envVars)) {
        core.exportVariable(key, value);
      }
    }

    // Agent mode uses prompt field
    if (context.prompt) {
      return context.prompt;
    }

    // Minimal fallback - repository is a string in PreparedContext
    return `Repository: ${context.repository}`;
  },

  getSystemPrompt() {
    // Agent mode doesn't need additional system prompts
    return undefined;
  },
};
