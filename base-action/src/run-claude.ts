import * as core from "@actions/core";
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";

interface ClaudeOptions {
  claudeArgs?: string;
  allowedTools?: string;
  disallowedTools?: string;
  maxTurns?: string;
  mcpConfig?: string;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  claudeEnv?: string;
  fallbackModel?: string;
  model?: string;
  pathToClaudeCodeExecutable?: string;
}

export async function runClaude(promptFile: string, options: ClaudeOptions) {
  try {
    const claudeExecutable =
      options.pathToClaudeCodeExecutable || "claude-code";

    // Build claude command
    let cmd = `${claudeExecutable} --prompt-file "${promptFile}"`;

    // Add options
    if (options.allowedTools) {
      cmd += ` --allowed-tools "${options.allowedTools}"`;
    }
    if (options.disallowedTools) {
      cmd += ` --disallowed-tools "${options.disallowedTools}"`;
    }
    if (options.maxTurns) {
      cmd += ` --max-turns ${options.maxTurns}`;
    }
    if (options.mcpConfig) {
      cmd += ` --mcp-config "${options.mcpConfig}"`;
    }
    if (options.systemPrompt) {
      cmd += ` --system-prompt "${options.systemPrompt}"`;
    }
    if (options.appendSystemPrompt) {
      cmd += ` --append-system-prompt "${options.appendSystemPrompt}"`;
    }
    if (options.model) {
      cmd += ` --model "${options.model}"`;
    }
    if (options.fallbackModel) {
      cmd += ` --fallback-model "${options.fallbackModel}"`;
    }
    if (options.claudeArgs) {
      cmd += ` ${options.claudeArgs}`;
    }

    // Execute claude-code
    console.log(`Executing: ${cmd}`);
    const result = execSync(cmd, {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      env: {
        ...process.env,
        ...(options.claudeEnv ? JSON.parse(options.claudeEnv) : {}),
      },
    });

    // Create execution log file
    const executionFile = join(
      process.cwd(),
      `claude-execution-${Date.now()}.json`,
    );
    const logData = {
      command: cmd,
      output: result,
      success: true,
      timestamp: new Date().toISOString(),
    };

    writeFileSync(executionFile, JSON.stringify(logData, null, 2));

    // Set outputs
    core.setOutput("conclusion", "success");
    core.setOutput("execution_file", executionFile);

    console.log("✅ Claude Code execution completed successfully");
  } catch (error) {
    // Create execution log file for error case
    const executionFile = join(
      process.cwd(),
      `claude-execution-error-${Date.now()}.json`,
    );
    const logData = {
      error: error instanceof Error ? error.message : String(error),
      success: false,
      timestamp: new Date().toISOString(),
    };

    writeFileSync(executionFile, JSON.stringify(logData, null, 2));

    core.setOutput("conclusion", "failure");
    core.setOutput("execution_file", executionFile);

    throw error;
  }
}
