#!/usr/bin/env bun

import * as core from "@actions/core";
import { writeFile } from "fs/promises";
import { join } from "path";

const STRUCTURED_OUTPUT_FILENAME = "claude-structured-output.json";

export function getStructuredOutputFilePath(): string | undefined {
  if (!process.env.RUNNER_TEMP) {
    return undefined;
  }
  return join(process.env.RUNNER_TEMP, STRUCTURED_OUTPUT_FILENAME);
}

/**
 * Publishes structured JSON for later steps.
 *
 * `structured_output` is the JSON string. GitHub may refuse to publish that
 * string as a job output when it contains a masked secret (the runner warning
 * is `Skip output ... may contain secret`). `structured_output_file` is only
 * the path to the same JSON, so a later step can upload it as an artifact.
 */
export async function publishStructuredOutput(
  structuredOutput: string,
): Promise<void> {
  core.setOutput("structured_output", structuredOutput);

  const outputFile = getStructuredOutputFilePath();
  if (!outputFile) {
    core.warning(
      "Failed to write structured output file: RUNNER_TEMP is not set",
    );
    return;
  }

  try {
    await writeFile(outputFile, structuredOutput, { mode: 0o600 });
    core.setOutput("structured_output_file", outputFile);
  } catch (error) {
    core.warning(`Failed to write structured output file: ${error}`);
  }
}
