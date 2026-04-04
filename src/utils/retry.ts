import { isNonRetryable } from "./errors";

export type RetryOptions = {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  /**
   * Return false to abort retries immediately for this error.
   * Defaults to skipping retries for any error that implements the
   * {@link NonRetryable} marker interface (i.e. has `retryable: false`).
   */
  shouldRetry?: (error: Error) => boolean;
};

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 5000,
    maxDelayMs = 20000,
    backoffFactor = 2,
    shouldRetry,
  } = options;

  if (maxAttempts < 1) {
    throw new Error("maxAttempts must be >= 1");
  }

  const effectiveShouldRetry = shouldRetry ?? ((e: Error) => !isNonRetryable(e));

  let delayMs = initialDelayMs;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Attempt ${attempt} of ${maxAttempts}...`);
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Attempt ${attempt} failed:`, lastError.message);

      if (attempt < maxAttempts) {
        if (!effectiveShouldRetry(lastError)) {
          console.error(
            `Non-retryable error (${lastError.name}), aborting retries`,
          );
          break;
        }
        console.log(`Retrying in ${delayMs / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs = Math.min(delayMs * backoffFactor, maxDelayMs);
      }
    }
  }

  console.error(`Operation failed after ${maxAttempts} attempts`);
  throw lastError;
}
