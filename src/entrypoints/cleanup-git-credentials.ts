#!/usr/bin/env bun

/**
 * Remove the token this action embedded in the origin URL.
 * Runs as a post step, next to the revocation of the token itself.
 */

import { removeOriginCredentials } from "../github/operations/git-config";

async function run() {
  try {
    await removeOriginCredentials();
  } catch (error) {
    // Don't fail the action if cleanup fails, just log it
    console.error(
      "Failed to remove the credential from the origin URL:",
      error,
    );
  }
}

if (import.meta.main) {
  run();
}
