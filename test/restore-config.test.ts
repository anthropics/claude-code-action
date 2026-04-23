import { describe, test, expect } from "bun:test";
import { resolveEnableAllProjectMcpServers } from "../src/github/operations/restore-config";

describe("resolveEnableAllProjectMcpServers (wrapper)", () => {
  test("explicit 'true' wins", () => {
    expect(resolveEnableAllProjectMcpServers("true")).toBe(true);
  });

  test("explicit 'false' wins", () => {
    expect(resolveEnableAllProjectMcpServers("false")).toBe(false);
  });

  test("unset → enabled (wrapper restores project config from base in PR contexts)", () => {
    expect(resolveEnableAllProjectMcpServers("")).toBe(true);
    expect(resolveEnableAllProjectMcpServers(undefined)).toBe(true);
  });

  test("non-boolean strings fall through to default true", () => {
    expect(resolveEnableAllProjectMcpServers("yes")).toBe(true);
    expect(resolveEnableAllProjectMcpServers("1")).toBe(true);
  });
});
