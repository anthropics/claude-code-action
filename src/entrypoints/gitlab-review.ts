#!/usr/bin/env node

import { runGitLabPipeline } from "../gitlab/workflow/pipeline";
import { logger } from "../gitlab/utils/logger";

async function main() {
  try {
    await runGitLabPipeline();
  } catch (error) {
    logger.error("GitLab review workflow failed", error);
    process.exitCode = 1;
  }
}

void main();

