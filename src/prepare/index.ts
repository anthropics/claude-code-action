/**
 * Main prepare module that delegates to the mode's prepare method
 */

import type { PrepareOptions, PrepareResult } from "./types";

export async function prepare(options: PrepareOptions): Promise<PrepareResult> {
  const { mode, context, octokit, githubToken } = options;

  console.log(
    `Preparing with mode: ${mode.name} for event: ${context.eventName}`,
  );

  // Delegate to the mode's prepare method
  return mode.prepare({
    context,
    octokit,
    githubToken,
  });
}
