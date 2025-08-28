import * as core from "@actions/core";
import { mkdir, writeFile } from "fs/promises";
import type { Mode, ModeOptions, ModeResult } from "../types";
import type { PreparedContext } from "../../create-prompt/types";
import { prepareMcpConfig } from "../../mcp/install-mcp-server";
import { parseAllowedTools } from "./parse-tools";
import { configureGitAuth } from "../../github/operations/git-config";
import { fetchGitHubData } from "../../github/data/fetcher";
import { isEntityContext } from "../../github/context";

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
    // Configure git authentication for agent mode (same as tag mode)
    if (!context.inputs.useCommitSigning) {
      try {
        // Get the authenticated user (will be claude[bot] when using Claude App token)
        const { data: authenticatedUser } =
          await octokit.rest.users.getAuthenticated();
        const user = {
          login: authenticatedUser.login,
          id: authenticatedUser.id,
        };

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

    // Download GitHub assets automatically for entity contexts
    if (isEntityContext(context)) {
      console.log("Downloading GitHub assets for agent mode...");

      try {
        // Fetch GitHub data (reuse existing logic)
        const githubData = await fetchGitHubData({
          octokits: octokit,
          repository: `${context.repository.owner}/${context.repository.repo}`,
          prNumber: context.entityNumber.toString(),
          isPR: context.isPR,
          triggerUsername: context.actor,
        });

        // Set simple environment variable with comma-separated paths
        const downloadedPaths = Array.from(githubData.imageUrlMap.values());
        if (downloadedPaths.length > 0) {
          const concatDownloadedPaths = downloadedPaths.join(",");
          process.env.CLAUDE_ASSET_FILES = concatDownloadedPaths;
          core.exportVariable("CLAUDE_ASSET_FILES", concatDownloadedPaths);
          console.log(
            `Exposed ${downloadedPaths.length} assets: ${concatDownloadedPaths}`,
          );
        }
      } catch (error) {
        console.error("Failed to download GitHub assets:", error);
        // Continue execution - don't fail the entire action
      }
    }

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
