import { describe, it, expect, mock, beforeEach } from "bun:test";

// Create mock functions first, then register them with mock.module
const mockedExecFileSync = mock(() => undefined);
const mockedRmSync = mock(() => undefined);

mock.module("child_process", () => ({
  execFileSync: mockedExecFileSync,
}));

mock.module("fs", () => ({
  rmSync: mockedRmSync,
}));

// Dynamic import after mocking to guarantee bindings point to mocks
const { restoreConfigFromBase } = await import(
  "../src/github/operations/restore-config"
);

describe("restoreConfigFromBase", () => {
  beforeEach(() => {
    mockedExecFileSync.mockClear();
    mockedRmSync.mockClear();
  });

  it("passes --no-recurse-submodules to git fetch", () => {
    restoreConfigFromBase("main");

    // First call should be git fetch with --no-recurse-submodules
    const fetchCall = (mockedExecFileSync as any).mock.calls[0];
    expect(fetchCall[0]).toBe("git");
    expect(fetchCall[1]).toContain("fetch");
    expect(fetchCall[1]).toContain("--no-recurse-submodules");
  });

  it("sets GIT_TERMINAL_PROMPT=0 to prevent credential hangs", () => {
    restoreConfigFromBase("main");

    // All git calls should have GIT_TERMINAL_PROMPT=0 in env
    for (const call of (mockedExecFileSync as any).mock.calls) {
      const options = call[2];
      expect(options.env.GIT_TERMINAL_PROMPT).toBe("0");
    }
  });

  it("sets a timeout on all git operations", () => {
    restoreConfigFromBase("main");

    for (const call of (mockedExecFileSync as any).mock.calls) {
      const options = call[2];
      expect(options.timeout).toBeGreaterThan(0);
    }
  });

  it("deletes sensitive paths before restoring them", () => {
    restoreConfigFromBase("main");

    // rmSync should be called for each sensitive path
    const rmCalls = (mockedRmSync as any).mock.calls;
    expect(rmCalls.length).toBeGreaterThanOrEqual(5);

    const deletedPaths = rmCalls.map((c: any) => c[0]);
    expect(deletedPaths).toContain(".claude");
    expect(deletedPaths).toContain(".mcp.json");
    expect(deletedPaths).toContain(".gitmodules");
  });

  it("uses the provided baseBranch in git commands", () => {
    restoreConfigFromBase("release/5.1.0");

    const fetchCall = (mockedExecFileSync as any).mock.calls[0];
    expect(fetchCall[1]).toContain("release/5.1.0");
  });

  it("continues if a path does not exist on the base branch", () => {
    let callCount = 0;
    (mockedExecFileSync as any).mockImplementation(
      (_cmd: string, args: string[]) => {
        callCount++;
        // Fail on the first checkout (simulating .claude not existing on base)
        if (args[0] === "checkout" && callCount === 2) {
          throw new Error("pathspec '.claude' did not match any file(s)");
        }
      },
    );

    // Should not throw
    expect(() => restoreConfigFromBase("main")).not.toThrow();
  });
});
