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
import type { GitHubContext } from "../github/context";
import { isAutomationContext } from "../github/context";

export const DEFAULT_MODE = "tag" as const;
export const VALID_MODES = [
  "tag",
  "agent",
  "experimental-review",
  "plan",
] as const;

/**
 * All available modes.
 * Add new modes here as they are created.
 */
const modes = {} as Record<ModeName, Mode>;

// Lazy load modes to avoid circular dependencies
function loadModes() {
  if (!modes.tag) {
    const { tagMode } = require("./tag");
    const { agentMode } = require("./agent");
    const { reviewMode } = require("./review");
    const { planMode } = require("./plan");

    modes.tag = tagMode;
    modes.agent = agentMode;
    modes["experimental-review"] = reviewMode;
    modes.plan = planMode;
  }
}

/**
 * Retrieves a mode by name and validates it can handle the event type.
 * @param name The mode name to retrieve
 * @param context The GitHub context to validate against
 * @returns The requested mode
 * @throws Error if the mode is not found or cannot handle the event
 */
export function getMode(name: ModeName, context: GitHubContext): Mode {
  loadModes();
  const mode = modes[name];
  if (!mode) {
    const validModes = VALID_MODES.join("', '");
    throw new Error(
      `Invalid mode '${name}'. Valid modes are: '${validModes}'. Please check your workflow configuration.`,
    );
  }

  // Validate mode can handle the event type
  if (name === "tag" && isAutomationContext(context)) {
    throw new Error(
      `Tag mode cannot handle ${context.eventName} events. Use 'agent' mode for automation events.`,
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
