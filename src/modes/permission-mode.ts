import { readFileSync } from "fs";

type SettingsInput = {
  permissions?: { defaultMode?: unknown };
  env?: { ANTHROPIC_BASE_URL?: unknown };
} | null;

/** Reads the `settings` input, which is a JSON string or a file path. */
function readSettingsInput(): SettingsInput {
  const input = process.env.INPUT_SETTINGS?.trim();
  if (!input) return null;
  try {
    return JSON.parse(input);
  } catch {
    // Not JSON, so the input is a file path.
  }
  try {
    return JSON.parse(readFileSync(input, "utf-8"));
  } catch {
    // setupClaudeCodeSettings reports this later and fails the run.
    return null;
  }
}

/**
 * Whether a session starts in auto mode unless claude_args sets another mode.
 *
 * These runs keep their earlier default and can opt in:
 * - allowed_non_write_users: anyone's text reaches these runs, so what no allow
 *   rule covers stays denied rather than left to a review.
 * - A custom ANTHROPIC_BASE_URL, in the environment or the settings input: auto
 *   mode's safety check can depend on what an LLM gateway passes through, and a
 *   session that gets no verdict denies calls and can stop.
 * - A permission mode other than auto in the settings input: the default must not
 *   silently replace a mode the workflow chose.
 */
export function defaultsToAutoMode(): boolean {
  const settings = readSettingsInput();
  const settingsBaseUrl = settings?.env?.ANTHROPIC_BASE_URL;
  const settingsMode = settings?.permissions?.defaultMode;
  return (
    !process.env.ALLOWED_NON_WRITE_USERS?.trim() &&
    !process.env.ANTHROPIC_BASE_URL?.trim() &&
    !(typeof settingsBaseUrl === "string" && settingsBaseUrl.trim()) &&
    (!settingsMode || settingsMode === "auto")
  );
}
