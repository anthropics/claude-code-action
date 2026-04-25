import { mkdir, writeFile } from "fs/promises";
import { prepareMcpConfig } from "../../mcp/install-mcp-server";
import { parseAllowedTools } from "./parse-tools";
import {
  configureGitAuth,
  setupSshSigning,
} from "../../github/operations/git-config";
import { checkHumanActor } from "../../github/validation/actor";
import { createInitialComment } from "../../github/operations/comments/create-initial";
import { isEntityContext } from "../../github/context";
import type { GitHubContext } from "../../github/context";
import type { Octokits } from "../../github/api/client";

/**
 * Prepares the agent mode execution context.
 *
 * Agent mode runs whenever an explicit prompt is provided in the workflow configuration.
 * It bypasses the standard @claude mention checking and comment tracking used by tag mode,
 * providing direct access to Claude Code for automation workflows.
 */
export async function prepareAgentMode({
  context,
  octokit,
  githubToken,
}: {
  context: GitHubContext;
  octokit: Octokits;
  githubToken: string;
}) {
  // Check if actor is human (prevents bot-triggered loops)
  await checkHumanActor(octokit.rest, context);

  // Configure git authentication for agent mode (same as tag mode)
  // SSH signing takes precedence if provided
  const useSshSigning = !!context.inputs.sshSigningKey;
  const useApiCommitSigning = context.inputs.useCommitSigning && !useSshSigning;

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
  const defaultBranch = context.repository.default_branch || "main";
  const baseBranch = context.inputs.baseBranch || defaultBranch;

  // Detect current branch from GitHub environment
  const currentBranch =
    claudeBranch ||
    process.env.GITHUB_HEAD_REF ||
    process.env.GITHUB_REF_NAME ||
    defaultBranch;

  // Create a sticky comment when requested and we have an entity (PR or issue) to comment on.
  // Without this, the MCP comment server starts without CLAUDE_COMMENT_ID and every
  // update_claude_comment call fails with "CLAUDE_COMMENT_ID environment variable is required".
  let commentId: number | undefined;
  if (context.inputs.useStickyComment && isEntityContext(context)) {
    const commentData = await createInitialComment(octokit.rest, context);
    commentId = commentData.id;
  }

  // Get our GitHub MCP servers config
  const ourMcpConfig = await prepareMcpConfig({
    githubToken,
    owner: context.repository.owner,
    repo: context.repository.repo,
    branch: currentBranch,
    baseBranch: baseBranch,
    claudeCommentId: commentId?.toString(),
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

  return {
    commentId,
    branchInfo: {
      baseBranch: baseBranch,
      currentBranch: baseBranch, // Use base branch as current when creating new branch
      claudeBranch: claudeBranch,
    },
    mcpConfig: ourMcpConfig,
    claudeArgs,
  };
}
