import * as core from "@actions/core";
import { exec } from "child_process";
import { promisify } from "util";
import { unlink, writeFile, stat } from "fs/promises";
import { createWriteStream } from "fs";
import { spawn } from "child_process";
import { parse as parseShellArgs } from "shell-quote";

const execAsync = promisify(exec);

const PIPE_PATH = `${process.env.RUNNER_TEMP}/claude_prompt_pipe`;
const EXECUTION_FILE = `${process.env.RUNNER_TEMP}/claude-execution-output.json`;
const BASE_ARGS = ["--verbose", "--output-format", "stream-json"];

/**
 * Sanitizes JSON output to remove sensitive information when full output is disabled
 * Returns a safe summary message or null if the message should be completely suppressed
 */
function sanitizeJsonOutput(
  jsonObj: any,
  showFullOutput: boolean,
): string | null {
  if (showFullOutput) {
    // In full output mode, return the full JSON
    return JSON.stringify(jsonObj, null, 2);
  }

  // In non-full-output mode, provide minimal safe output
  const type = jsonObj.type;
  const subtype = jsonObj.subtype;

  // System initialization - safe to show
  if (type === "system" && subtype === "init") {
    return JSON.stringify(
      {
        type: "system",
        subtype: "init",
        message: "Claude Code initialized",
        model: jsonObj.model || "unknown",
      },
      null,
      2,
    );
  }

  // Result messages - Always show the final result
  if (type === "result") {
    // These messages contain the final result and should always be visible
    return JSON.stringify(
      {
        type: "result",
        subtype: jsonObj.subtype,
        is_error: jsonObj.is_error,
        duration_ms: jsonObj.duration_ms,
        num_turns: jsonObj.num_turns,
        total_cost_usd: jsonObj.total_cost_usd,
        permission_denials: jsonObj.permission_denials,
      },
      null,
      2,
    );
  }

  // For any other message types, suppress completely in non-full-output mode
  return null;
}

export type ClaudeOptions = {
  claudeArgs?: string;
  model?: string;
  pathToClaudeCodeExecutable?: string;
  allowedTools?: string;
  disallowedTools?: string;
  maxTurns?: string;
  mcpConfig?: string;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  claudeEnv?: string;
  fallbackModel?: string;
  showFullOutput?: string;
};

type PreparedConfig = {
  claudeArgs: string[];
  promptPath: string;
  env: Record<string, string>;
};

export function prepareRunConfig(
  promptPath: string,
  options: ClaudeOptions,
): PreparedConfig {
  // Build Claude CLI arguments:
  // 1. Prompt flag (always first)
  // 2. User's claudeArgs (full control)
  // 3. BASE_ARGS (always last, cannot be overridden)

  const claudeArgs = ["-p"];

  // Parse and add user's custom Claude arguments
  if (options.claudeArgs?.trim()) {
    const parsed = parseShellArgs(options.claudeArgs);
    const customArgs = parsed.filter(
      (arg): arg is string => typeof arg === "string",
    );
    claudeArgs.push(...customArgs);
  }

  // BASE_ARGS are always appended last (cannot be overridden)
  claudeArgs.push(...BASE_ARGS);

  const customEnv: Record<string, string> = {};

  if (process.env.INPUT_ACTION_INPUTS_PRESENT) {
    customEnv.GITHUB_ACTION_INPUTS = process.env.INPUT_ACTION_INPUTS_PRESENT;
  }

  return {
    claudeArgs,
    promptPath,
    env: customEnv,
  };
}

export async function runClaude(promptPath: string, options: ClaudeOptions) {
  const config = prepareRunConfig(promptPath, options);

  // Create a named pipe
  try {
    await unlink(PIPE_PATH);
  } catch (e) {
    // Ignore if file doesn't exist
  }

  // Create the named pipe
  await execAsync(`mkfifo "${PIPE_PATH}"`);

  // Log prompt file size
  let promptSize = "unknown";
  try {
    const stats = await stat(config.promptPath);
    promptSize = stats.size.toString();
  } catch (e) {
    // Ignore error
  }

  console.log(`Prompt file size: ${promptSize} bytes`);

  // Log custom environment variables if any
  const customEnvKeys = Object.keys(config.env).filter(
    (key) => key !== "CLAUDE_ACTION_INPUTS_PRESENT",
  );
  if (customEnvKeys.length > 0) {
    console.log(`Custom environment variables: ${customEnvKeys.join(", ")}`);
  }

  // Log custom arguments if any
  if (options.claudeArgs && options.claudeArgs.trim() !== "") {
    console.log(`Custom Claude arguments: ${options.claudeArgs}`);
  }

  // Output to console
  console.log(`Running Claude with prompt from file: ${config.promptPath}`);
  console.log(`Full command: claude ${config.claudeArgs.join(" ")}`);

  // Start sending prompt to pipe in background
  const catProcess = spawn("cat", [config.promptPath], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const pipeStream = createWriteStream(PIPE_PATH);
  catProcess.stdout.pipe(pipeStream);

  catProcess.on("error", (error) => {
    console.error("Error reading prompt file:", error);
    pipeStream.destroy();
  });

  // Use custom executable path if provided, otherwise default to "claude"
  const claudeExecutable = options.pathToClaudeCodeExecutable || "claude";

  const claudeProcess = spawn(claudeExecutable, config.claudeArgs, {
    stdio: ["pipe", "pipe", "inherit"],
    env: {
      ...process.env,
      ...config.env,
    },
  });

  // Handle Claude process errors
  claudeProcess.on("error", (error) => {
    console.error("Error spawning Claude process:", error);
    pipeStream.destroy();
  });

  // Determine if full output should be shown
  // Show full output if explicitly set to "true" OR if GitHub Actions debug mode is enabled
  const isDebugMode = process.env.ACTIONS_STEP_DEBUG === "true";
  let showFullOutput = options.showFullOutput === "true" || isDebugMode;

  if (isDebugMode && options.showFullOutput !== "false") {
    console.log("Debug mode detected - showing full output");
    showFullOutput = true;
  } else if (!showFullOutput) {
    console.log("Running Claude Code (full output hidden for security)...");
    console.log(
      "Rerun in debug mode or enable `show_full_output: true` in your workflow file for full output.",
    );
  }

  // Capture output for parsing execution metrics
  let output = "";
  claudeProcess.stdout.on("data", (data) => {
    const text = data.toString();

    // Try to parse as JSON and handle based on verbose setting
    const lines = text.split("\n");
    lines.forEach((line: string, index: number) => {
      if (line.trim() === "") return;

      try {
        // Check if this line is a JSON object
        const parsed = JSON.parse(line);
        const sanitizedOutput = sanitizeJsonOutput(parsed, showFullOutput);

        if (sanitizedOutput) {
          process.stdout.write(sanitizedOutput);
          if (index < lines.length - 1 || text.endsWith("\n")) {
            process.stdout.write("\n");
          }
        }
      } catch (e) {
        // Not a JSON object
        if (showFullOutput) {
          // In full output mode, print as is
          process.stdout.write(line);
          if (index < lines.length - 1 || text.endsWith("\n")) {
            process.stdout.write("\n");
          }
        }
        // In non-full-output mode, suppress non-JSON output
      }
    });

    output += text;
  });

  // Handle stdout errors
  claudeProcess.stdout.on("error", (error) => {
    console.error("Error reading Claude stdout:", error);
  });

  // Pipe from named pipe to Claude
  const pipeProcess = spawn("cat", [PIPE_PATH]);
  pipeProcess.stdout.pipe(claudeProcess.stdin);

  // Handle pipe process errors
  pipeProcess.on("error", (error) => {
    console.error("Error reading from named pipe:", error);
    claudeProcess.kill("SIGTERM");
  });

  // Wait for Claude to finish
  const exitCode = await new Promise<number>((resolve) => {
    claudeProcess.on("close", (code) => {
      resolve(code || 0);
    });

    claudeProcess.on("error", (error) => {
      console.error("Claude process error:", error);
      resolve(1);
    });
  });

  // Clean up processes
  try {
    catProcess.kill("SIGTERM");
  } catch (e) {
    // Process may already be dead
  }
  try {
    pipeProcess.kill("SIGTERM");
  } catch (e) {
    // Process may already be dead
  }

  // Clean up pipe file
  try {
    await unlink(PIPE_PATH);
  } catch (e) {
    // Ignore errors during cleanup
  }

  // Set conclusion based on exit code
  if (exitCode === 0) {
    // Try to process the output and save execution metrics
    try {
      await writeFile("output.txt", output);

      // Process output.txt into JSON and save to execution file
      // Increase maxBuffer from Node.js default of 1MB to 10MB to handle large Claude outputs
      const { stdout: jsonOutput } = await execAsync("jq -s '.' output.txt", {
        maxBuffer: 10 * 1024 * 1024,
      });
      await writeFile(EXECUTION_FILE, jsonOutput);

      console.log(`Log saved to ${EXECUTION_FILE}`);
    } catch (e) {
      core.warning(`Failed to process output for execution metrics: ${e}`);
    }

    core.setOutput("conclusion", "success");
    core.setOutput("execution_file", EXECUTION_FILE);
  } else {
    core.setOutput("conclusion", "failure");

    // Still try to save execution file if we have output
    if (output) {
      try {
        await writeFile("output.txt", output);
        // Increase maxBuffer from Node.js default of 1MB to 10MB to handle large Claude outputs
        const { stdout: jsonOutput } = await execAsync("jq -s '.' output.txt", {
          maxBuffer: 10 * 1024 * 1024,
        });
        await writeFile(EXECUTION_FILE, jsonOutput);
        core.setOutput("execution_file", EXECUTION_FILE);
      } catch (e) {
        // Ignore errors when processing output during failure
      }
    }

    process.exit(exitCode);
  }
}
