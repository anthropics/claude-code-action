#!/usr/bin/env bun

import * as core from "@actions/core";
import { preparePrompt } from "./prepare-prompt";
import { runClaude } from "./run-claude";
import { setupClaudeCodeSettings } from "./setup-claude-code-settings";
import { validateEnvironmentVariables } from "./validate-env";

async function run() {
  try {
    validateEnvironmentVariables();

    await setupClaudeCodeSettings(
      process.env.INPUT_SETTINGS,
      undefined, // homeDir
      process.env.INPUT_EXPERIMENTAL_SLASH_COMMANDS_DIR,
    );

    const promptConfig = await preparePrompt({
      prompt: process.env.INPUT_PROMPT || "",
      promptFile: process.env.INPUT_PROMPT_FILE || "",
    });

    await runClaude(promptConfig.path, {
      timeoutMinutes: process.env.INPUT_TIMEOUT_MINUTES,
      claudeArgs: process.env.INPUT_CLAUDE_ARGS,
    });
  } catch (error) {
    core.setFailed(`Action failed with error: ${error}`);
    core.setOutput("conclusion", "failure");
    process.exit(1);
  }
}

if (import.meta.main) {
  run();
}
