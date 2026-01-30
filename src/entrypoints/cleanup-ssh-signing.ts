#!/usr/bin/env bun

/**
 * Cleanup SSH signing key after action completes
 * This is run as a post step for security purposes
 */

import { cleanupSshSigning } from "../github/operations/git-config";

async function run() {
  try {
    await cleanupSshSigning();
  } catch (error) {
    // Don't fail the action if cleanup fails, just log it
    console.error("Failed to cleanup SSH signing key:", error);
  }
}

if (import.meta.main) {
  run();
}
