export type RetryOptions = {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  shouldRetry?: (error: Error) => boolean;
};

/**
 * Error class for errors that should not be retried.
 * When thrown inside a retryWithBackoff operation, the retry loop
 * will immediately rethrow without further attempts.
 */
export class NonRetryableError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "NonRetryableError";
  }
}

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

  let delayMs = initialDelayMs;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Attempt ${attempt} of ${maxAttempts}...`);
      return await operation();
    } catch (error) {
      // Non-retryable errors should fail immediately without further retries
      if (error instanceof NonRetryableError) {
        throw error.cause ?? error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Attempt ${attempt} failed:`, lastError.message);

      if (shouldRetry && !shouldRetry(lastError)) {
        console.error("Error is not retryable, giving up immediately");
        throw lastError;
      }

      if (attempt < maxAttempts) {
        console.log(`Retrying in ${delayMs / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs = Math.min(delayMs * backoffFactor, maxDelayMs);
      }
    }
  }

  console.error(`Operation failed after ${maxAttempts} attempts`);
  throw lastError;
}
