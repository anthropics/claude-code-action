#!/usr/bin/env bun

/**
 * Finalize the todo list after Claude execution by reading any updates
 * from Claude and uploading the final state as an artifact
 */

import * as core from "@actions/core";
import { todoManager } from "../utils/todo-manager";

async function run() {
  try {
    core.info("Finalizing todo list after Claude execution...");

    // Finalize the todo list by reading Claude's updates and uploading artifacts
    await todoManager.finalizeTodoAfterClaude();

    core.info("Todo list finalization completed successfully");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.warning(`Todo list finalization failed: ${errorMessage}`);
    // Don't fail the action for todo list issues, just log the warning
  }
}

if (import.meta.main) {
  run();
}