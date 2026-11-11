/**
 * Whether a session starts in auto mode unless claude_args sets another mode.
 * Auto mode's safety check can depend on what an LLM gateway passes through, and
 * a session that gets no verdict denies calls and can stop, so sessions with a
 * custom ANTHROPIC_BASE_URL keep their earlier default and can opt in.
 */
export function defaultsToAutoMode(): boolean {
  return !process.env.ANTHROPIC_BASE_URL?.trim();
}
