import { describe, it, expect, afterEach } from "bun:test";
import {
  parseFlagValue,
  resolveModel,
  resolveEffort,
} from "../src/utils/claude-args";

describe("parseFlagValue", () => {
  it("returns undefined for empty or missing args", () => {
    expect(parseFlagValue(undefined, ["model"])).toBeUndefined();
    expect(parseFlagValue("", ["model"])).toBeUndefined();
    expect(parseFlagValue("   ", ["model"])).toBeUndefined();
  });

  it("extracts a space-separated flag value", () => {
    expect(parseFlagValue("--model claude-sonnet-4-6", ["model"])).toBe(
      "claude-sonnet-4-6",
    );
  });

  it("extracts an equals-form flag value", () => {
    expect(parseFlagValue("--model=claude-sonnet-4-6", ["model"])).toBe(
      "claude-sonnet-4-6",
    );
  });

  it("handles quoted values", () => {
    expect(parseFlagValue(`--model "claude sonnet"`, ["model"])).toBe(
      "claude sonnet",
    );
  });

  it("returns undefined when the flag has no value", () => {
    expect(parseFlagValue("--model", ["model"])).toBeUndefined();
    expect(parseFlagValue("--model --effort high", ["model"])).toBeUndefined();
  });

  it("returns undefined when the flag is not present", () => {
    expect(parseFlagValue("--effort high", ["model"])).toBeUndefined();
  });

  it("returns the value of the first matching flag", () => {
    expect(
      parseFlagValue("--reasoning-effort low --effort high", [
        "effort",
        "reasoning-effort",
      ]),
    ).toBe("low");
  });

  it("does not treat a following flag as the value", () => {
    expect(parseFlagValue("--model --effort", ["model"])).toBeUndefined();
  });
});

describe("resolveEffort", () => {
  it("returns effort from --effort", () => {
    expect(resolveEffort("--effort high")).toBe("high");
  });

  it("falls back to --reasoning-effort", () => {
    expect(resolveEffort("--reasoning-effort xhigh")).toBe("xhigh");
  });

  it("returns undefined when no effort flag is present", () => {
    expect(resolveEffort("--model claude-sonnet-4-6")).toBeUndefined();
  });
});

describe("resolveModel", () => {
  const original = process.env.ANTHROPIC_MODEL;
  afterEach(() => {
    if (original === undefined) delete process.env.ANTHROPIC_MODEL;
    else process.env.ANTHROPIC_MODEL = original;
  });

  it("returns --model from claude_args when env is unset", () => {
    delete process.env.ANTHROPIC_MODEL;
    expect(resolveModel("--model claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
  });

  it("prefers ANTHROPIC_MODEL env over claude_args", () => {
    process.env.ANTHROPIC_MODEL = "claude-opus-4-7";
    expect(resolveModel("--model claude-sonnet-4-6")).toBe("claude-opus-4-7");
  });

  it("returns undefined when neither is set", () => {
    delete process.env.ANTHROPIC_MODEL;
    expect(resolveModel("")).toBeUndefined();
  });
});
