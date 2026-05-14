import * as core from "@actions/core";
import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";

const EXECUTION_FILENAME = "claude-execution-output.json";

export function getExecutionFilePath(): string | undefined {
  if (!process.env.RUNNER_TEMP) {
    return undefined;
  }
  return join(process.env.RUNNER_TEMP, EXECUTION_FILENAME);
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
