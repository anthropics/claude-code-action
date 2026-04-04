/**
 * Marker interface for errors that should not be retried.
 *
 * Implement this on error classes that represent deterministic failures
 * where retrying cannot produce a different outcome (e.g., auth errors,
 * validation failures, resource-not-found errors).
 *
 * @example
 * class ValidationError extends Error implements NonRetryable {
 *   readonly retryable = false as const;
 * }
 */
export interface NonRetryable {
  readonly retryable: false;
}

/**
 * An HTTP error carrying the response status code.
 *
 * Implements {@link NonRetryable} — errors with deterministic HTTP status codes
 * (e.g. 400, 404, 422) should not be retried. Callers that want to retry specific
 * status codes (e.g. 403, 429) should throw a plain `Error` for those cases instead.
 */
export class HttpError extends Error implements NonRetryable {
  readonly retryable = false as const;

  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Type guard that returns true if the error declares itself non-retryable
 * via the {@link NonRetryable} marker interface.
 */
export function isNonRetryable(error: unknown): error is NonRetryable {
  return (
    typeof error === "object" &&
    error !== null &&
    "retryable" in (error as object) &&
    (error as NonRetryable).retryable === false
  );
}
