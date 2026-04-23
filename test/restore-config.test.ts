import { describe, test, expect } from "bun:test";
import { resolveEnableAllProjectMcpServers } from "../src/github/operations/restore-config";

describe("resolveEnableAllProjectMcpServers", () => {
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

  test("unset → disabled when config was not restored (workflow_run, push, schedule)", () => {
    expect(resolveEnableAllProjectMcpServers("", false)).toBe(false);
    expect(resolveEnableAllProjectMcpServers(undefined, false)).toBe(false);
  });

  test("non-boolean strings fall through to restore state", () => {
    expect(resolveEnableAllProjectMcpServers("yes", false)).toBe(false);
    expect(resolveEnableAllProjectMcpServers("1", true)).toBe(true);
  });
});
