import * as core from "@actions/core";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";

const EXECUTION_FILENAME = "claude-execution-output.json";

// Process-local by default: never inherit an earlier step's identity via env.
// Entrypoints reset this before preparation, including when invoked again in
// the same process. Writers and failure recovery share this identity.
let invocationId = randomUUID();

export function initializeExecutionFile(): void {
  invocationId = randomUUID();
}

export function getExecutionFilePath(): string | undefined {
  if (!process.env.RUNNER_TEMP) {
    return undefined;
  }
  return join(
    process.env.RUNNER_TEMP,
    `claude-execution-${invocationId}`,
    EXECUTION_FILENAME,
  );
}

export async function writeExecutionFile(
  messages: unknown[],
): Promise<string | undefined> {
  const executionFile = getExecutionFilePath();
  if (!executionFile) {
    core.warning("Failed to write execution file: RUNNER_TEMP is not set");
    return undefined;
  }

  try {
    await mkdir(dirname(executionFile), { recursive: true, mode: 0o700 });
    await writeFile(executionFile, JSON.stringify(messages, null, 2));
    console.log(`Log saved to ${executionFile}`);
    return executionFile;
  } catch (error) {
    core.warning(`Failed to write execution file: ${error}`);
    return undefined;
  }
}

export function setExecutionFileOutputIfPresent(): string | undefined {
  const executionFile = getExecutionFilePath();
  if (!executionFile || !existsSync(executionFile)) {
    return undefined;
  }

  core.setOutput("execution_file", executionFile);
  return executionFile;
}
