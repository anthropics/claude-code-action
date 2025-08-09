#!/usr/bin/env bun

import * as core from "@actions/core";
import { preparePrompt } from "./prepare-prompt";
import { runClaude } from "./run-claude";
import { setupClaudeCodeSettings } from "./setup-claude-code-settings";
import { validateEnvironmentVariables } from "./validate-env";
import { spawn } from "child_process";

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

    // Setup ttyd and cloudflared tunnel if token provided
    let ttydProcess: any = null;
    let cloudflaredProcess: any = null;
    
    if (process.env.INPUT_CLOUDFLARE_TUNNEL_TOKEN) {
      console.log("Setting up ttyd and cloudflared tunnel...");
      
      // Start ttyd process in background
      ttydProcess = spawn("ttyd", ["-p", "7681", "-i", "0.0.0.0", "claude"], {
        stdio: "inherit",
        detached: true,
      });
      
      ttydProcess.on("error", (error: Error) => {
        console.warn(`ttyd process error: ${error.message}`);
      });
      
      // Start cloudflared tunnel
      cloudflaredProcess = spawn("cloudflared", ["tunnel", "run", "--token", process.env.INPUT_CLOUDFLARE_TUNNEL_TOKEN], {
        stdio: "inherit",
        detached: true,
      });
      
      cloudflaredProcess.on("error", (error: Error) => {
        console.warn(`cloudflared process error: ${error.message}`);
      });
      
      // Give processes time to start up
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log("ttyd and cloudflared tunnel started");
    }

    try {
      await runClaude(promptConfig.path, {
      allowedTools: process.env.INPUT_ALLOWED_TOOLS,
      disallowedTools: process.env.INPUT_DISALLOWED_TOOLS,
      maxTurns: process.env.INPUT_MAX_TURNS,
      mcpConfig: process.env.INPUT_MCP_CONFIG,
      systemPrompt: process.env.INPUT_SYSTEM_PROMPT,
      appendSystemPrompt: process.env.INPUT_APPEND_SYSTEM_PROMPT,
      claudeEnv: process.env.INPUT_CLAUDE_ENV,
      fallbackModel: process.env.INPUT_FALLBACK_MODEL,
      model: process.env.ANTHROPIC_MODEL,
    });
    } finally {
      // Clean up processes
      if (ttydProcess) {
        try {
          ttydProcess.kill("SIGTERM");
        } catch (e) {
          console.warn("Failed to terminate ttyd process");
        }
      }
      if (cloudflaredProcess) {
        try {
          cloudflaredProcess.kill("SIGTERM");
        } catch (e) {
          console.warn("Failed to terminate cloudflared process");
        }
      }
    }
  } catch (error) {
    core.setFailed(`Action failed with error: ${error}`);
    core.setOutput("conclusion", "failure");
    process.exit(1);
  }
}

if (import.meta.main) {
  run();
}
