import { describe, expect, test, spyOn, beforeEach, afterEach } from "bun:test";
import { retryWithBackoff } from "../src/utils/retry";
import { isNonRetryable } from "../src/utils/errors";
import type { NonRetryable } from "../src/utils/errors";
import { WorkflowValidationSkipError } from "../src/github/token";

// Silence console output during tests
let consoleLogSpy: ReturnType<typeof spyOn>;
let consoleErrorSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
  consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

// Helper: create an operation that fails N times then succeeds
function failThenSucceed(failCount: number, successValue = "ok") {
  let calls = 0;
  return async () => {
    calls++;
    if (calls <= failCount) throw new Error(`Attempt ${calls} failed`);
    return successValue;
  };
}

describe("isNonRetryable", () => {
  test("returns false for a plain Error", () => {
    expect(isNonRetryable(new Error("oops"))).toBe(false);
  });

  test("returns false for null", () => {
    expect(isNonRetryable(null)).toBe(false);
  });

  test("returns false for a string", () => {
    expect(isNonRetryable("error string")).toBe(false);
  });

  test("returns true for an object with retryable: false", () => {
    expect(isNonRetryable({ retryable: false })).toBe(true);
  });

  test("returns false for an object with retryable: true", () => {
    expect(isNonRetryable({ retryable: true })).toBe(false);
  });
});

describe("retryWithBackoff", () => {
  describe("baseline: retries transient errors", () => {
    test("retries a plain Error up to maxAttempts", async () => {
      const operation = failThenSucceed(2);
      const result = await retryWithBackoff(operation, {
        maxAttempts: 3,
        initialDelayMs: 0,
        maxDelayMs: 0,
      });
      expect(result).toBe("ok");
    });

    test("throws after exhausting all attempts", async () => {
      const operation = failThenSucceed(99);
      await expect(
        retryWithBackoff(operation, {
          maxAttempts: 3,
          initialDelayMs: 0,
          maxDelayMs: 0,
        }),
      ).rejects.toThrow("Attempt 3 failed");
    });

    test("succeeds on first attempt without retrying", async () => {
      let calls = 0;
      const result = await retryWithBackoff(async () => {
        calls++;
        return "success";
      });
      expect(result).toBe("success");
      expect(calls).toBe(1);
    });
  });

  describe("NonRetryable default: skips retry for retryable=false errors", () => {
    test("does not retry an error with retryable=false", async () => {
      class MyNonRetryableError extends Error implements NonRetryable {
        readonly retryable = false as const;
      }
      let calls = 0;
      await expect(
        retryWithBackoff(
          async () => {
            calls++;
            throw new MyNonRetryableError("deterministic failure");
          },
          { maxAttempts: 3, initialDelayMs: 0, maxDelayMs: 0 },
        ),
      ).rejects.toThrow("deterministic failure");
      expect(calls).toBe(1);
    });

    test("does not log 'aborting retries' on the final attempt of a retryable error", async () => {
      await expect(
        retryWithBackoff(failThenSucceed(99), {
          maxAttempts: 2,
          initialDelayMs: 0,
          maxDelayMs: 0,
        }),
      ).rejects.toThrow();
      const abortingCalls = (consoleErrorSpy.mock.calls as string[][]).filter(
        (args) => typeof args[0] === "string" && args[0].includes("aborting retries"),
      );
      expect(abortingCalls).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    test("maxAttempts=0 throws immediately", async () => {
      await expect(
        retryWithBackoff(async () => "ok", { maxAttempts: 0 }),
      ).rejects.toThrow("maxAttempts must be >= 1");
    });

    test("wraps non-Error thrown values into Error", async () => {
      await expect(
        retryWithBackoff(
          async () => {
            throw "a plain string error";
          },
          { maxAttempts: 1 },
        ),
      ).rejects.toThrow("a plain string error");
    });

    test("shouldRetry is called with the thrown error object", async () => {
      const targetError = new Error("specific error");
      const shouldRetry = spyOn({ shouldRetry: () => false }, "shouldRetry");
      shouldRetry.mockImplementation(() => false);
      await expect(
        retryWithBackoff(
          async () => {
            throw targetError;
          },
          { maxAttempts: 3, initialDelayMs: 0, maxDelayMs: 0, shouldRetry },
        ),
      ).rejects.toThrow("specific error");
      expect(shouldRetry).toHaveBeenCalledWith(targetError);
    });
  });

  describe("explicit shouldRetry option", () => {
    test("shouldRetry=()=>false stops retries immediately", async () => {
      let calls = 0;
      await expect(
        retryWithBackoff(
          async () => {
            calls++;
            throw new Error("always fails");
          },
          {
            maxAttempts: 3,
            initialDelayMs: 0,
            maxDelayMs: 0,
            shouldRetry: () => false,
          },
        ),
      ).rejects.toThrow("always fails");
      expect(calls).toBe(1);
    });

    test("shouldRetry=()=>true retries up to maxAttempts", async () => {
      const operation = failThenSucceed(2);
      const result = await retryWithBackoff(operation, {
        maxAttempts: 3,
        initialDelayMs: 0,
        maxDelayMs: 0,
        shouldRetry: () => true,
      });
      expect(result).toBe("ok");
    });
  });

  describe("WorkflowValidationSkipError integration", () => {
    test("WorkflowValidationSkipError is not retried (implements NonRetryable)", async () => {
      let calls = 0;
      await expect(
        retryWithBackoff(
          async () => {
            calls++;
            throw new WorkflowValidationSkipError("workflow not found");
          },
          { maxAttempts: 3, initialDelayMs: 0, maxDelayMs: 0 },
        ),
      ).rejects.toBeInstanceOf(WorkflowValidationSkipError);
      expect(calls).toBe(1);
    });

    test("WorkflowValidationSkipError has retryable=false", () => {
      const err = new WorkflowValidationSkipError("test");
      expect(err.retryable).toBe(false);
      expect(isNonRetryable(err)).toBe(true);
    });
  });
});
