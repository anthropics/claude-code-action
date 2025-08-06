#!/usr/bin/env bun

/**
 * Unified entrypoint that combines prepare and run-claude steps
 */

import * as core from "@actions/core";
import { setupGitHubToken } from "../github/token";
import { checkWritePermissions } from "../github/validation/permissions";
import { createOctokit } from "../github/api/client";
import { parseGitHubContext, isEntityContext } from "../github/context";
import { getMode, isValidMode, DEFAULT_MODE } from "../modes/registry";
import type { ModeName } from "../modes/types";
import { prepare } from "../prepare";
import { runClaudeCore } from "../../base-action/src/run-claude-core";
import { validateEnvironmentVariables } from "../../base-action/src/validate-env";
import { setupClaudeCodeSettings } from "../../base-action/src/setup-claude-code-settings";

async function run() {
  try {
    // Step 1: Get mode first to determine authentication method
    const modeInput = process.env.MODE || DEFAULT_MODE;

    // Validate mode input
    if (!isValidMode(modeInput)) {
      throw new Error(`Invalid mode: ${modeInput}`);
    }
    const validatedMode: ModeName = modeInput;

    // Step 2: Setup GitHub token based on mode
    let githubToken: string;
    if (validatedMode === "experimental-review") {
      // For experimental-review mode, use the default GitHub Action token
      githubToken = process.env.DEFAULT_WORKFLOW_TOKEN || "";
      if (!githubToken) {
        throw new Error(
          "DEFAULT_WORKFLOW_TOKEN not found for experimental-review mode",
        );
      }
      console.log("Using default GitHub Action token for review mode");
    } else {
      // For other modes, use the existing token exchange
      githubToken = await setupGitHubToken();
    }
    const octokit = createOctokit(githubToken);

    // Step 3: Parse GitHub context (once for all operations)
    const context = parseGitHubContext();

    // Step 4: Check write permissions (only for entity contexts)
    if (isEntityContext(context)) {
      const hasWritePermissions = await checkWritePermissions(
        octokit.rest,
        context,
      );
      if (!hasWritePermissions) {
        throw new Error(
          "Actor does not have write permissions to the repository",
        );
      }
    }

    // Step 5: Get mode and check trigger conditions
    const mode = getMode(validatedMode, context);
    const containsTrigger = mode.shouldTrigger(context);

    // Set output for action.yml to check (in case it's still needed)
    core.setOutput("contains_trigger", containsTrigger.toString());

    if (!containsTrigger) {
      console.log("No trigger found, skipping remaining steps");
      return;
    }

    // Step 6: Use the modular prepare function
    const prepareResult = await prepare({
      context,
      octokit,
      mode,
      githubToken,
    });

    // Set critical outputs immediately after prepare completes
    // This ensures they're available for cleanup even if Claude fails
    core.setOutput("GITHUB_TOKEN", githubToken);
    core.setOutput("mcp_config", prepareResult.mcpConfig);
    if (prepareResult.branchInfo.claudeBranch) {
      core.setOutput("branch_name", prepareResult.branchInfo.claudeBranch);
      core.setOutput("CLAUDE_BRANCH", prepareResult.branchInfo.claudeBranch);
    }
    core.setOutput("BASE_BRANCH", prepareResult.branchInfo.baseBranch);
    if (prepareResult.commentId) {
      core.setOutput("claude_comment_id", prepareResult.commentId.toString());
    }

    // Step 7: The mode.prepare() call already created the prompt and set up tools
    // We need to get the allowed/disallowed tools from environment variables
    // TODO: Update Mode interface to return tools from prepare() instead of relying on env vars
    const allowedTools = process.env.ALLOWED_TOOLS || "";
    const disallowedTools = process.env.DISALLOWED_TOOLS || "";
    const promptFile = `${process.env.RUNNER_TEMP}/claude-prompts/claude-prompt.txt`;

    // Step 8: Validate environment and setup Claude settings
    validateEnvironmentVariables();
    await setupClaudeCodeSettings(process.env.SETTINGS);

    // Step 9: Run Claude Code
    console.log("Running Claude Code...");

    // Build environment object to pass to Claude
    const claudeEnvObject: Record<string, string> = {
      GITHUB_TOKEN: githubToken,
      NODE_VERSION: process.env.NODE_VERSION || "18.x",
      DETAILED_PERMISSION_MESSAGES: "1",
      CLAUDE_CODE_ACTION: "1",
    };

    await runClaudeCore({
      promptFile,
      settings: process.env.SETTINGS,
      allowedTools,
      disallowedTools,
      maxTurns: process.env.MAX_TURNS,
      mcpConfig: prepareResult.mcpConfig,
      systemPrompt: "",
      appendSystemPrompt: "",
      claudeEnv: process.env.CLAUDE_ENV,
      fallbackModel: process.env.FALLBACK_MODEL,
      model: process.env.ANTHROPIC_MODEL || process.env.MODEL,
      timeoutMinutes: process.env.TIMEOUT_MINUTES || "30",
      env: claudeEnvObject,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.setFailed(`Action failed with error: ${errorMessage}`);
    // Also output the clean error message for the action to capture
    core.setOutput("prepare_error", errorMessage);
    core.setOutput("conclusion", "failure");
    process.exit(1);
  }
}

if (import.meta.main) {
  run();
}
