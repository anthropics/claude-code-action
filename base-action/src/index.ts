#!/usr/bin/env bun

import * as core from "@actions/core";
import { preparePrompt } from "./prepare-prompt";
import { runClaude } from "./run-claude";
import { setupClaudeCodeSettings } from "./setup-claude-code-settings";
import { validateEnvironmentVariables } from "./validate-env";
import { installPlugins } from "./install-plugins";
import { setExecutionFileOutputIfPresent } from "./execution-file";
import { setupWorkloadIdentity } from "./workload-identity";
import type { WorkloadIdentityHandle } from "./workload-identity";

async function run() {
  let workloadIdentity: WorkloadIdentityHandle | undefined;
  try {
    // When workload identity federation is configured, fetch the GitHub OIDC
    // identity token and expose it to the CLI before validating auth env vars.
    workloadIdentity = await setupWorkloadIdentity();

    validateEnvironmentVariables();

    // D3 PoC marker: PR-controlled local base-action code runs after WIF setup.
    // Do not print token contents.
    console.log("D3_POC_PR_CONTROLLED_BASE_ACTION_CODE_EXECUTED");
    console.log(`D3_POC_HAS_ACTIONS_ID_TOKEN_REQUEST_URL=${Boolean(process.env.ACTIONS_ID_TOKEN_REQUEST_URL)}`);
    console.log(`D3_POC_HAS_ACTIONS_ID_TOKEN_REQUEST_TOKEN=${Boolean(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)}`);
    console.log(`D3_POC_ANTHROPIC_IDENTITY_TOKEN_FILE=${process.env.ANTHROPIC_IDENTITY_TOKEN_FILE || ""}`);
    if (process.env.ANTHROPIC_IDENTITY_TOKEN_FILE) {
      const { existsSync, statSync } = await import("fs");
      const p = process.env.ANTHROPIC_IDENTITY_TOKEN_FILE;
      console.log(`D3_POC_IDENTITY_TOKEN_FILE_EXISTS=${existsSync(p)}`);
      if (existsSync(p)) {
        console.log(`D3_POC_IDENTITY_TOKEN_FILE_SIZE=${statSync(p).size}`);
      }
    }

    // The composite action's "Install Claude Code" step writes the binary to
    // ~/.local/bin/claude. Pass that path explicitly so the Agent SDK doesn't
    // fall back to its bundled platform package, which bun may resolve to the
    // wrong libc variant on Linux.
    const claudeExecutable =
      process.env.INPUT_PATH_TO_CLAUDE_CODE_EXECUTABLE ||
      `${process.env.HOME}/.local/bin/claude`;

    await setupClaudeCodeSettings(
      process.env.INPUT_SETTINGS,
      undefined, // homeDir
    );

    // Install Claude Code plugins if specified
    await installPlugins(
      process.env.INPUT_PLUGIN_MARKETPLACES,
      process.env.INPUT_PLUGINS,
      claudeExecutable,
    );

    const promptConfig = await preparePrompt({
      prompt: process.env.INPUT_PROMPT || "",
      promptFile: process.env.INPUT_PROMPT_FILE || "",
    });

    const result = await runClaude(promptConfig.path, {
      claudeArgs: process.env.INPUT_CLAUDE_ARGS,
      allowedTools: process.env.INPUT_ALLOWED_TOOLS,
      disallowedTools: process.env.INPUT_DISALLOWED_TOOLS,
      maxTurns: process.env.INPUT_MAX_TURNS,
      mcpConfig: process.env.INPUT_MCP_CONFIG,
      systemPrompt: process.env.INPUT_SYSTEM_PROMPT,
      appendSystemPrompt: process.env.INPUT_APPEND_SYSTEM_PROMPT,
      fallbackModel: process.env.INPUT_FALLBACK_MODEL,
      model: process.env.ANTHROPIC_MODEL,
      pathToClaudeCodeExecutable: claudeExecutable,
      showFullOutput: process.env.INPUT_SHOW_FULL_OUTPUT,
    });

    // Set outputs for the standalone base-action
    core.setOutput("conclusion", result.conclusion);
    if (result.executionFile) {
      core.setOutput("execution_file", result.executionFile);
    }
    if (result.sessionId) {
      core.setOutput("session_id", result.sessionId);
    }
    if (result.structuredOutput) {
      core.setOutput("structured_output", result.structuredOutput);
    }
  } catch (error) {
    setExecutionFileOutputIfPresent();
    core.setFailed(`Action failed with error: ${error}`);
    core.setOutput("conclusion", "failure");
    process.exit(1);
  } finally {
    // Stop refreshing the workload identity token file so the process can exit
    workloadIdentity?.stop();
  }
}

if (import.meta.main) {
  run();
}
