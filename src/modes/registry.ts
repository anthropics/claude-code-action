/**
 * Mode Registry for claude-code-action v1.0
 *
 * This module provides access to all available execution modes and handles
 * automatic mode detection based on GitHub event types.
 */

import type { Mode, ModeName } from "./types";
import { tagMode } from "./tag";
import { agentMode } from "./agent";
import type { GitHubContext } from "../github/context";
import { detectMode, type AutoDetectedMode } from "./detector";

export const VALID_MODES = ["tag", "agent"] as const;

/**
 * All available modes in v1.0
 */
const modes = {
  tag: tagMode,
  agent: agentMode,
} as const satisfies Record<AutoDetectedMode, Mode>;

/**
 * Automatically detects and retrieves the appropriate mode based on the GitHub context.
 * In v1.0, modes are auto-selected based on event type.
 * @param context The GitHub context
 * @returns The appropriate mode for the context
 */
export function getMode(context: GitHubContext): Mode {
  const modeName = detectMode(context);
  console.log(
    `Auto-detected mode: ${modeName} for event: ${context.eventName}`,
  );

  const mode = modes[modeName];
  if (!mode) {
    throw new Error(
      `Mode '${modeName}' not found. This should not happen. Please report this issue.`,
    );
  }

  return mode;
}

/**
 * Type guard to check if a string is a valid mode name.
 * @param name The string to check
 * @returns True if the name is a valid mode name
 */
export function isValidMode(name: string): name is ModeName {
  const validModes = ["tag", "agent"];
  return validModes.includes(name);
}
