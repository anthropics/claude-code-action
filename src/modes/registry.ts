/**
 * Mode Registry for claude-code-action
 *
 * This module provides access to all available execution modes.
 *
 * To add a new mode:
 * 1. Add the mode name to VALID_MODES below
 * 2. Create the mode implementation in a new directory (e.g., src/modes/new-mode/)
 * 3. Import and add it to the modes object below
 * 4. Update action.yml description to mention the new mode
 */

import type { Mode, ModeName } from "./types";
import { tagMode } from "./tag";
import { agentMode } from "./agent";

export const DEFAULT_MODE = "tag" as const;
export const VALID_MODES = ["tag", "agent"] as const;

/**
 * All available modes.
 * Add new modes here as they are created.
 */
const modes = {
  tag: tagMode,
  agent: agentMode,
} as const satisfies Record<ModeName, Mode>;

/**
 * Retrieves a mode by name.
 * @param name The mode name to retrieve
 * @returns The requested mode
 * @throws Error if the mode is not found
 */
export function getMode(name: ModeName): Mode {
  const mode = modes[name];
  if (!mode) {
    const validModes = VALID_MODES.join("', '");
    throw new Error(
      `Invalid mode '${name}'. Valid modes are: '${validModes}'. Please check your workflow configuration.`,
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
  return VALID_MODES.includes(name as ModeName);
}
