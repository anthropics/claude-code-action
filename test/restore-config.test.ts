import { describe, test, expect } from "bun:test";
import { resolveEnableAllProjectMcpServers } from "../src/github/operations/restore-config";

describe("resolveEnableAllProjectMcpServers (wrapper)", () => {
  test("explicit 'true' wins regardless of restore state", () => {
    expect(resolveEnableAllProjectMcpServers("true", false)).toBe(true);
    expect(resolveEnableAllProjectMcpServers("true", true)).toBe(true);
  });

  test("explicit 'false' wins regardless of restore state", () => {
    expect(resolveEnableAllProjectMcpServers("false", true)).toBe(false);
    expect(resolveEnableAllProjectMcpServers("false", false)).toBe(false);
  });

  test("unset → enabled when config was restored from base (entity PR context)", () => {
    expect(resolveEnableAllProjectMcpServers("", true)).toBe(true);
    expect(resolveEnableAllProjectMcpServers(undefined, true)).toBe(true);
  });

  test("unset → undefined when config was not restored (defer to base-action event-aware default)", () => {
    expect(resolveEnableAllProjectMcpServers("", false)).toBeUndefined();
    expect(resolveEnableAllProjectMcpServers(undefined, false)).toBeUndefined();
  });

  test("non-boolean strings fall through to restore state", () => {
    expect(resolveEnableAllProjectMcpServers("yes", false)).toBeUndefined();
    expect(resolveEnableAllProjectMcpServers("1", true)).toBe(true);
  });
});
