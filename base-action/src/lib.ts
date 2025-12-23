/**
 * Library exports for the base-action.
 * These functions can be imported directly by the main action
 * to avoid file/output-based communication between steps.
 */

export { runClaudeWithSdk, runClaudeWithSdkFromFile } from "./run-claude-sdk";
export type { RunClaudeResult, PromptInput } from "./run-claude-sdk";
export { setupClaudeCodeSettings } from "./setup-claude-code-settings";
export { installPlugins } from "./install-plugins";
export { parseSdkOptions } from "./parse-sdk-options";
export type { ClaudeOptions } from "./run-claude";
export type { ParsedSdkOptions } from "./parse-sdk-options";
