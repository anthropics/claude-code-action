import { describe, test, expect } from "bun:test";
import { getMode, isValidMode } from "../../src/modes/registry";
import type { ModeName } from "../../src/modes/types";
import { tagMode } from "../../src/modes/tag";
import { agentMode } from "../../src/modes/agent";

describe("Mode Registry", () => {
  test("getMode returns tag mode by default", () => {
    const mode = getMode("tag");
    expect(mode).toBe(tagMode);
    expect(mode.name).toBe("tag");
  });

  test("getMode returns agent mode", () => {
    const mode = getMode("agent");
    expect(mode).toBe(agentMode);
    expect(mode.name).toBe("agent");
  });

  test("getMode throws error for invalid mode", () => {
    const invalidMode = "invalid" as unknown as ModeName;
    expect(() => getMode(invalidMode)).toThrow(
      "Invalid mode 'invalid'. Valid modes are: 'tag', 'agent'. Please check your workflow configuration.",
    );
  });

  test("isValidMode returns true for all valid modes", () => {
    expect(isValidMode("tag")).toBe(true);
    expect(isValidMode("agent")).toBe(true);
  });

  test("isValidMode returns false for invalid mode", () => {
    expect(isValidMode("invalid")).toBe(false);
    expect(isValidMode("review")).toBe(false);
  });
});
