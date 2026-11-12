type SettingsInput = {
  permissions?: { defaultMode?: unknown };
  env?: { ANTHROPIC_BASE_URL?: unknown };
} | null;

/**
 * Whether a session starts in auto mode unless claude_args sets another mode.
 *
 * These runs keep their earlier default and can opt in:
 * - allowed_non_write_users or allowed_bots: other people's text reaches these
 *   runs without a write-access check, so what no allow rule covers stays denied
 *   rather than left to a review.
 * - A custom ANTHROPIC_BASE_URL, in the environment or the settings input: auto
 *   mode's safety check can depend on what an LLM gateway passes through, and a
 *   session that gets no verdict denies calls and can stop.
 * - path_to_claude_code_executable: the action doesn't install that CLI, and one
 *   that predates auto mode exits on the flag before the session starts.
 * - A settings input that chooses a permission mode other than auto: the default
 *   must not silently replace a mode the workflow chose.
 * - A settings input that is a file path: a pull request can change that file, and
 *   config restored from the base branch comes later, so it can't decide this.
 */
export function defaultsToAutoMode(): boolean {
  if (
    process.env.ALLOWED_NON_WRITE_USERS?.trim() ||
    process.env.ALLOWED_BOTS?.trim() ||
    process.env.ANTHROPIC_BASE_URL?.trim() ||
    process.env.PATH_TO_CLAUDE_CODE_EXECUTABLE?.trim()
  ) {
    return false;
  }

  const input = process.env.INPUT_SETTINGS?.trim();
  if (!input) return true;

  let settings: SettingsInput;
  try {
    settings = JSON.parse(input);
  } catch {
    return false;
  }
  const baseUrl = settings?.env?.ANTHROPIC_BASE_URL;
  const mode = settings?.permissions?.defaultMode;
  return (
    !(typeof baseUrl === "string" && baseUrl.trim()) &&
    (!mode || mode === "auto")
  );
}
