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

  test("unset → enabled when project config is trusted (PR restored, or non-PR entity event)", () => {
    expect(resolveEnableAllProjectMcpServers("", true)).toBe(true);
    expect(resolveEnableAllProjectMcpServers(undefined, true)).toBe(true);
  });

  test("unset → undefined when project config not trusted (defer to base-action event-aware default)", () => {
    expect(resolveEnableAllProjectMcpServers("", false)).toBeUndefined();
    expect(resolveEnableAllProjectMcpServers(undefined, false)).toBeUndefined();
  });

  test("non-boolean strings fall through to trust state", () => {
    expect(resolveEnableAllProjectMcpServers("yes", false)).toBeUndefined();
    expect(resolveEnableAllProjectMcpServers("1", true)).toBe(true);
  });
});
