#!/usr/bin/env bun

import * as core from "@actions/core";
import { chmod, mkdtemp, writeFile } from "fs/promises";
import { join } from "path";

const STRUCTURED_OUTPUT_FILENAME = "claude-structured-output.json";
const STRUCTURED_OUTPUT_DIRECTORY_PREFIX = "claude-structured-output-";

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

  const runnerTemp = process.env.RUNNER_TEMP;
  if (!runnerTemp) {
    core.warning(
      "Failed to write structured output file: RUNNER_TEMP is not set",
    );
    return;
  }

  try {
    // Use a new private directory for every invocation. A job can invoke the
    // action more than once, so a fixed filename would let a later invocation
    // overwrite a file that an earlier step still needs to upload.
    const outputDirectory = await mkdtemp(
      join(runnerTemp, STRUCTURED_OUTPUT_DIRECTORY_PREFIX),
    );
    await chmod(outputDirectory, 0o700);
    const outputFile = join(outputDirectory, STRUCTURED_OUTPUT_FILENAME);
    await writeFile(outputFile, structuredOutput, { mode: 0o600 });
    await chmod(outputFile, 0o600);
    core.setOutput("structured_output_file", outputFile);
  } catch (error) {
    core.warning(`Failed to write structured output file: ${error}`);
  }
}
