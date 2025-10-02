#!/usr/bin/env node

import { runGitLabPipeline } from "../gitlab/workflow/pipeline";
import { logger } from "../gitlab/utils/logger";

async function main() {
  try {
    await runGitLabPipeline();
  } catch (error) {
    logger.error("GitLab review workflow failed", error);
    // Also log to stderr for visibility in CI
    if (error instanceof Error) {
      console.error("\nError details:");
      console.error(`Message: ${error.message}`);
      if (error.stack) {
        console.error(`Stack:\n${error.stack}`);
      }
    }
    process.exitCode = 1;
  }
}

void main();

