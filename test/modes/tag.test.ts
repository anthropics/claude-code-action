import { describe, test, expect } from "bun:test";
import { prepareTagMode, PrepareTagModeError } from "../../src/modes/tag";

describe("Tag Mode", () => {
  test("prepareTagMode is exported as a function", () => {
    expect(typeof prepareTagMode).toBe("function");
  });
});

describe("PrepareTagModeError", () => {
  test("carries the tracking comment id and underlying cause", () => {
    const cause = new Error("fetchGitHubData failed");
    const error = new PrepareTagModeError(cause.message, {
      cause,
      commentId: 42,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("PrepareTagModeError");
    expect(error.commentId).toBe(42);
    expect(error.cause).toBe(cause);
    expect(error.message).toBe("fetchGitHubData failed");
  });

  test("commentId is undefined when not provided", () => {
    const error = new PrepareTagModeError("boom");
    expect(error.commentId).toBeUndefined();
  });
});
