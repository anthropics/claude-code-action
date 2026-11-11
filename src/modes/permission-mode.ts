/**
 * Whether a session starts in auto mode unless claude_args sets another mode.
 *
 * Two kinds of run keep their earlier default and can opt in:
 * - allowed_non_write_users: anyone's text reaches these runs, so what no allow
 *   rule covers stays denied rather than left to a review.
 * - A custom ANTHROPIC_BASE_URL: auto mode's safety check can depend on what an
 *   LLM gateway passes through, and a session that gets no verdict denies calls
 *   and can stop.
 */
export function defaultsToAutoMode(): boolean {
  return (
    !process.env.ALLOWED_NON_WRITE_USERS?.trim() &&
    !process.env.ANTHROPIC_BASE_URL?.trim()
  );
}
