import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { retryWithBackoff } from "../src/utils/retry";

describe("retryWithBackoff", () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = mock(() => {});
    console.error = mock(() => {});
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  it("returns the result on first success", async () => {
    const result = await retryWithBackoff(() => Promise.resolve("ok"), {
      maxAttempts: 3,
      initialDelayMs: 1,
    });
    expect(result).toBe("ok");
  });

  it("retries on failure and succeeds", async () => {
    let attempt = 0;
    const result = await retryWithBackoff(
      () => {
        attempt++;
        if (attempt < 3) throw new Error("transient");
        return Promise.resolve("recovered");
      },
      { maxAttempts: 3, initialDelayMs: 1 },
    );
    expect(result).toBe("recovered");
    expect(attempt).toBe(3);
  });

  it("throws after exhausting all attempts", async () => {
    await expect(
      retryWithBackoff(() => Promise.reject(new Error("permanent")), {
        maxAttempts: 2,
        initialDelayMs: 1,
      }),
    ).rejects.toThrow("permanent");
  });

  it("stops retrying immediately when shouldRetry returns false", async () => {
    class NonRetryableError extends Error {
      constructor() {
        super("non-retryable");
        this.name = "NonRetryableError";
      }
    }

    let attempts = 0;
    await expect(
      retryWithBackoff(
        () => {
          attempts++;
          throw new NonRetryableError();
        },
        {
          maxAttempts: 3,
          initialDelayMs: 1,
          shouldRetry: (error) => !(error instanceof NonRetryableError),
        },
      ),
    ).rejects.toThrow("non-retryable");
    expect(attempts).toBe(1);
  });

  it("continues retrying when shouldRetry returns true", async () => {
    let attempts = 0;
    await expect(
      retryWithBackoff(
        () => {
          attempts++;
          throw new Error("retryable");
        },
        {
          maxAttempts: 3,
          initialDelayMs: 1,
          shouldRetry: () => true,
        },
      ),
    ).rejects.toThrow("retryable");
    expect(attempts).toBe(3);
  });

  it("preserves the original error when shouldRetry aborts", async () => {
    class SpecificError extends Error {
      code = 401;
      constructor() {
        super("unauthorized");
        this.name = "SpecificError";
      }
    }

    try {
      await retryWithBackoff(
        () => {
          throw new SpecificError();
        },
        {
          maxAttempts: 3,
          initialDelayMs: 1,
          shouldRetry: (error) => !(error instanceof SpecificError),
        },
      );
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SpecificError);
      expect((error as SpecificError).code).toBe(401);
    }
  });
});
