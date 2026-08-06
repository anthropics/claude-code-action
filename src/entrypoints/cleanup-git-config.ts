#!/usr/bin/env bun

/**
 * Undo the git authentication configured for the run.
 *
 * Runs as a post step next to the token revocation so the workspace is left
 * without a reference to a token that is about to stop working.
 */

import { cleanupGitAuth } from "../github/operations/git-config";

async function run() {
  try {
    await cleanupGitAuth();
  } catch (error) {
    // Don't fail the action if cleanup fails, just log it
    console.error("Failed to clean up git authentication:", error);
  }
}

if (import.meta.main) {
  run();
}
