#!/usr/bin/env bun

import * as core from "@actions/core";
import { preparePrompt } from "./prepare-prompt";
import { runClaude } from "./run-claude";
import { setupClaudeCodeSettings } from "./setup-claude-code-settings";
import { validateEnvironmentVariables } from "./validate-env";
import { installPlugins } from "./install-plugins";
import { startBedrockProxy, parseCustomHeaders } from "./bedrock-http-proxy";

async function run() {
  let proxyServer: { port: number; close: () => void } | null = null;

  try {
    validateEnvironmentVariables();

    await setupClaudeCodeSettings(
      process.env.INPUT_SETTINGS,
      undefined, // homeDir
    );

    // Install Claude Code plugins if specified
    await installPlugins(
      process.env.INPUT_PLUGIN_MARKETPLACES,
      process.env.INPUT_PLUGINS,
      process.env.INPUT_PATH_TO_CLAUDE_CODE_EXECUTABLE,
    );

    // Check if Bedrock HTTP proxy is needed
    const useBedrock = process.env.CLAUDE_CODE_USE_BEDROCK === "1";
    const bedrockBaseUrl = process.env.ANTHROPIC_BEDROCK_BASE_URL;
    const customHeaders = process.env.ANTHROPIC_CUSTOM_HEADERS;

    if (useBedrock && bedrockBaseUrl && customHeaders) {
      // Start Bedrock HTTP proxy to translate Anthropic API format to Bedrock API format
      console.log(
        "[Base Action] Starting Bedrock HTTP proxy for custom headers support",
      );

      const headers = parseCustomHeaders(customHeaders);
      proxyServer = await startBedrockProxy(bedrockBaseUrl, headers);

      // Override environment to point SDK to localhost proxy
      process.env.CLAUDE_CODE_USE_BEDROCK = ""; // Disable Bedrock mode (use HTTP)
      process.env.ANTHROPIC_BASE_URL = `http://localhost:${proxyServer.port}`;
      delete process.env.ANTHROPIC_BEDROCK_BASE_URL; // Remove Bedrock base URL
      delete process.env.ANTHROPIC_CUSTOM_HEADERS; // Headers handled by proxy, not SDK

      console.log(
        `[Base Action] SDK will use proxy at http://localhost:${proxyServer.port}`,
      );
    }

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
      pathToClaudeCodeExecutable:
        process.env.INPUT_PATH_TO_CLAUDE_CODE_EXECUTABLE,
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
    core.setFailed(`Action failed with error: ${error}`);
    core.setOutput("conclusion", "failure");
    process.exit(1);
  } finally {
    // Stop proxy server if it was started
    if (proxyServer) {
      console.log("[Base Action] Stopping Bedrock HTTP proxy");
      proxyServer.close();
    }
  }
}

if (import.meta.main) {
  run();
}
