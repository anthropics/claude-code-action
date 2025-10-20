#!/usr/bin/env bun

/**
 * Prepare the Claude action by checking trigger conditions, verifying human actor,
 * and creating the initial tracking comment
 */

import * as core from "@actions/core";
import { setupGitHubToken } from "../github/token";
import { checkWritePermissions } from "../github/validation/permissions";
import { createOctokit } from "../github/api/client";
import { parseGitHubContext, isEntityContext } from "../github/context";
import { getMode } from "../modes/registry";
import { prepare } from "../prepare";
import { collectActionInputsPresence } from "./collect-inputs";
import { todoManager } from "../utils/todo-manager";
import { readFile } from "fs/promises";
import { join } from "path";

async function readTodoPersistenceInstructions(): Promise<string | null> {
  try {
    const instructionsPath = join(
      __dirname,
      "..",
      "prompts",
      "todo-persistence-instructions.md",
    );
    const content = await readFile(instructionsPath, "utf-8");
    return content;
  } catch (error) {
    core.warning(`Failed to read todo persistence instructions: ${error}`);
    return null;
  }
}

async function run() {
  try {
    collectActionInputsPresence();

    // Check if todo persistence is enabled
    const todoPermissionEnabled =
      process.env.ENABLE_TODO_PERSISTENCE === "true";

    // Initialize todo manager early in the process if enabled
    if (todoPermissionEnabled) {
      await todoManager.initialize();
    }

    // Parse GitHub context first to enable mode detection
    const context = parseGitHubContext();

    // Auto-detect mode based on context
    const mode = getMode(context);

    // Setup GitHub token
    const githubToken = await setupGitHubToken();
    const octokit = createOctokit(githubToken);

    // Step 3: Check write permissions (only for entity contexts)
    if (isEntityContext(context)) {
      // Check if github_token was provided as input (not from app)
      const githubTokenProvided = !!process.env.OVERRIDE_GITHUB_TOKEN;
      const hasWritePermissions = await checkWritePermissions(
        octokit.rest,
        context,
        context.inputs.allowedNonWriteUsers,
        githubTokenProvided,
      );
      if (!hasWritePermissions) {
        throw new Error(
          "Actor does not have write permissions to the repository",
        );
      }
    }

    // Check trigger conditions
    const containsTrigger = mode.shouldTrigger(context);

    // Debug logging
    console.log(`Mode: ${mode.name}`);
    console.log(`Context prompt: ${context.inputs?.prompt || "NO PROMPT"}`);
    console.log(`Trigger result: ${containsTrigger}`);

    // Set output for action.yml to check
    core.setOutput("contains_trigger", containsTrigger.toString());

    if (!containsTrigger) {
      console.log("No trigger found, skipping remaining steps");
      // Still set github_token output even when skipping
      core.setOutput("github_token", githubToken);
      return;
    }

    // Step 5: Use the new modular prepare function
    const result = await prepare({
      context,
      octokit,
      mode,
      githubToken,
    });

    // Step 5.5: Prepare todo list for Claude execution (if enabled)
    if (todoPermissionEnabled) {
      await todoManager.prepareTodoForClaude();
    }

    // MCP config is handled by individual modes (tag/agent) and included in their claude_args output

    // Expose the GitHub token (Claude App token) as an output
    core.setOutput("github_token", githubToken);

    // Step 6: Get system prompt from mode if available
    let systemPrompt = "";
    if (mode.getSystemPrompt) {
      const modeContext = mode.prepareContext(context, {
        commentId: result.commentId,
        baseBranch: result.branchInfo.baseBranch,
        claudeBranch: result.branchInfo.claudeBranch,
      });
      const modeSystemPrompt = mode.getSystemPrompt(modeContext);
      if (modeSystemPrompt) {
        systemPrompt += modeSystemPrompt;
      }
    }

    // Add todo persistence instructions if enabled
    if (todoPermissionEnabled) {
      const todoInstructions = await readTodoPersistenceInstructions();
      if (todoInstructions) {
        systemPrompt += `\n\n## Todo List Persistence\n\n${todoInstructions}`;
      }
    }

    if (systemPrompt) {
      core.exportVariable("APPEND_SYSTEM_PROMPT", systemPrompt);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.setFailed(`Prepare step failed with error: ${errorMessage}`);
    // Also output the clean error message for the action to capture
    core.setOutput("prepare_error", errorMessage);
    process.exit(1);
  }
}

if (import.meta.main) {
  run();
}
