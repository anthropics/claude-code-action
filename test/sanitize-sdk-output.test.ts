import { describe, it, expect } from "bun:test";
import { sanitizeSdkOutput } from "../base-action/src/run-claude-sdk";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

describe("sanitizeSdkOutput", () => {
  it("should show full output when showFullOutput is true", () => {
    const message = {
      type: "result",
      subtype: "success",
      is_error: false,
      result: "some sensitive result",
      duration_ms: 100,
      num_turns: 1,
      total_cost_usd: 0.01,
      permission_denials: [],
    } as unknown as SDKMessage;

    const output = sanitizeSdkOutput(message, true);
    expect(output).toContain("some sensitive result");
  });

  it("should not include result field for successful results", () => {
    const message = {
      type: "result",
      subtype: "success",
      is_error: false,
      result: "successful output that should be hidden",
      duration_ms: 100,
      num_turns: 1,
      total_cost_usd: 0.01,
      permission_denials: [],
    } as unknown as SDKMessage;

    const output = sanitizeSdkOutput(message, false);
    const parsed = JSON.parse(output!);
    expect(parsed.result).toBeUndefined();
    expect(parsed.is_error).toBe(false);
  });

  it("should include result field when is_error is true", () => {
    const message = {
      type: "result",
      subtype: "success",
      is_error: true,
      result:
        'API Error: 404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-sonnet-4-5-20250514"}}',
      duration_ms: 230,
      num_turns: 1,
      total_cost_usd: 0,
      permission_denials: [],
    } as unknown as SDKMessage;

    const output = sanitizeSdkOutput(message, false);
    const parsed = JSON.parse(output!);
    expect(parsed.is_error).toBe(true);
    expect(parsed.result).toContain("API Error: 404");
    expect(parsed.result).toContain("not_found_error");
  });

  it("should suppress non-result non-init messages", () => {
    const message = {
      type: "assistant",
      content: "some assistant content",
    } as unknown as SDKMessage;

    const output = sanitizeSdkOutput(message, false);
    expect(output).toBeNull();
  });

  it("should show sanitized init messages", () => {
    const message = {
      type: "system",
      subtype: "init",
      model: "claude-sonnet-4-5-20250929",
    } as unknown as SDKMessage;

    const output = sanitizeSdkOutput(message, false);
    const parsed = JSON.parse(output!);
    expect(parsed.type).toBe("system");
    expect(parsed.subtype).toBe("init");
    expect(parsed.model).toBe("claude-sonnet-4-5-20250929");
  });
});
