import * as core from "@actions/core";
import { mkdir, writeFile } from "fs/promises";
import type { Mode, ModeOptions, ModeResult } from "../types";
import type { PreparedContext } from "../../create-prompt/types";
import { prepareMcpConfig } from "../../mcp/install-mcp-server";
import { parseAllowedTools } from "./parse-tools";
import { GITHUB_SERVER_URL } from "../../github/api/config";

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
    githubToken,
    octokit,
  }: ModeOptions): Promise<ModeResult> {
    // Configure git authentication for agent mode
    // Since agent mode is for automation contexts, we set up git directly
    if (!context.inputs.useCommitSigning) {
      try {
        const { $ } = await import("bun");
        
        // Get the authenticated user (will be claude[bot] when using Claude App token)
        const { data: authenticatedUser } =
          await octokit.rest.users.getAuthenticated();
        
        // Determine the noreply email domain based on GITHUB_SERVER_URL
        const serverUrl = new URL(GITHUB_SERVER_URL);
        const noreplyDomain =
          serverUrl.hostname === "github.com"
            ? "users.noreply.github.com"
            : `users.noreply.${serverUrl.hostname}`;

        // Configure git user
        console.log(`Setting git user as ${authenticatedUser.login}...`);
        await $`git config user.name "${authenticatedUser.login}"`;
        await $`git config user.email "${authenticatedUser.id}+${authenticatedUser.login}@${noreplyDomain}"`;

        // Remove existing authentication headers (if any)
        try {
          await $`git config --unset-all http.${GITHUB_SERVER_URL}/.extraheader`;
        } catch (e) {
          // No existing headers to remove
        }

        // Update the remote URL to include the token for authentication
        const remoteUrl = `https://x-access-token:${githubToken}@${serverUrl.host}/${context.repository.owner}/${context.repository.repo}.git`;
        await $`git remote set-url origin ${remoteUrl}`;
        
        console.log(`✓ Configured git as ${authenticatedUser.login}`);
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

    // Add user's MCP_CONFIG env var as separate --mcp-config
    const userMcpConfig = process.env.MCP_CONFIG;
    if (userMcpConfig?.trim()) {
      const escapedUserConfig = userMcpConfig.replace(/'/g, "'\\''");
      claudeArgs = `${claudeArgs} --mcp-config '${escapedUserConfig}'`.trim();
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
