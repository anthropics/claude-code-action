#!/usr/bin/env bun

import { describe, test, expect, mock, spyOn, afterEach } from "bun:test";
import { installPlugins } from "../src/install-plugins";
import * as childProcess from "child_process";

describe("installPlugins", () => {
  let spawnSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    // Restore original spawn after each test
    if (spawnSpy) {
      spawnSpy.mockRestore();
    }
  });

  function createMockSpawn(
    exitCode: number | null = 0,
    shouldError: boolean = false,
  ) {
    const mockProcess = {
      on: mock((event: string, handler: Function) => {
        if (event === "close" && !shouldError) {
          // Simulate successful close
          setTimeout(() => handler(exitCode), 0);
        } else if (event === "error" && shouldError) {
          // Simulate error
          setTimeout(() => handler(new Error("spawn error")), 0);
        }
        return mockProcess;
      }),
    };

    spawnSpy = spyOn(childProcess, "spawn").mockImplementation(
      () => mockProcess as any,
    );
    return spawnSpy;
  }

  test("should not call spawn when no plugins are specified", async () => {
    const spy = createMockSpawn();
    await installPlugins("");
    expect(spy).not.toHaveBeenCalled();
  });

  test("should not call spawn when plugins is undefined", async () => {
    const spy = createMockSpawn();
    await installPlugins(undefined);
    expect(spy).not.toHaveBeenCalled();
  });

  test("should not call spawn when plugins is only whitespace", async () => {
    const spy = createMockSpawn();
    await installPlugins("   ");
    expect(spy).not.toHaveBeenCalled();
  });

  test("should install a single plugin with default executable", async () => {
    const spy = createMockSpawn();
    await installPlugins("test-plugin");

    expect(spy).toHaveBeenCalledTimes(2);
    // First call: add marketplace
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      [
        "plugin",
        "marketplace",
        "add",
        "https://github.com/anthropics/claude-code.git",
      ],
      { stdio: "inherit" },
    );
    // Second call: install plugin
    expect(spy).toHaveBeenNthCalledWith(
      2,
      "claude",
      ["plugin", "install", "test-plugin"],
      { stdio: "inherit" },
    );
  });

  test("should install multiple plugins sequentially", async () => {
    const spy = createMockSpawn();
    await installPlugins("plugin1,plugin2,plugin3");

    expect(spy).toHaveBeenCalledTimes(4);
    // First call: add marketplace
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      [
        "plugin",
        "marketplace",
        "add",
        "https://github.com/anthropics/claude-code.git",
      ],
      { stdio: "inherit" },
    );
    // Subsequent calls: install plugins
    expect(spy).toHaveBeenNthCalledWith(
      2,
      "claude",
      ["plugin", "install", "plugin1"],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      3,
      "claude",
      ["plugin", "install", "plugin2"],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      4,
      "claude",
      ["plugin", "install", "plugin3"],
      { stdio: "inherit" },
    );
  });

  test("should use custom claude executable path when provided", async () => {
    const spy = createMockSpawn();
    await installPlugins("test-plugin", "/custom/path/to/claude");

    expect(spy).toHaveBeenCalledTimes(2);
    // First call: add marketplace
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "/custom/path/to/claude",
      [
        "plugin",
        "marketplace",
        "add",
        "https://github.com/anthropics/claude-code.git",
      ],
      { stdio: "inherit" },
    );
    // Second call: install plugin
    expect(spy).toHaveBeenNthCalledWith(
      2,
      "/custom/path/to/claude",
      ["plugin", "install", "test-plugin"],
      { stdio: "inherit" },
    );
  });

  test("should trim whitespace from plugin names before installation", async () => {
    const spy = createMockSpawn();
    await installPlugins(" plugin1 , plugin2 ");

    expect(spy).toHaveBeenCalledTimes(3);
    // First call: add marketplace
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      [
        "plugin",
        "marketplace",
        "add",
        "https://github.com/anthropics/claude-code.git",
      ],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      2,
      "claude",
      ["plugin", "install", "plugin1"],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      3,
      "claude",
      ["plugin", "install", "plugin2"],
      { stdio: "inherit" },
    );
  });

  test("should skip empty entries in plugin list", async () => {
    const spy = createMockSpawn();
    await installPlugins("plugin1,,plugin2");

    expect(spy).toHaveBeenCalledTimes(3);
    // First call: add marketplace
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      [
        "plugin",
        "marketplace",
        "add",
        "https://github.com/anthropics/claude-code.git",
      ],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      2,
      "claude",
      ["plugin", "install", "plugin1"],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      3,
      "claude",
      ["plugin", "install", "plugin2"],
      { stdio: "inherit" },
    );
  });

  test("should handle plugin installation error and throw", async () => {
    createMockSpawn(1, false); // Exit code 1

    await expect(installPlugins("failing-plugin")).rejects.toThrow(
      "Failed to add marketplace (exit code: 1)",
    );
  });

  test("should handle null exit code (process terminated by signal)", async () => {
    createMockSpawn(null, false); // Exit code null (terminated by signal)

    await expect(installPlugins("terminated-plugin")).rejects.toThrow(
      "Failed to add marketplace: process terminated by signal",
    );
  });

  test("should stop installation on first error", async () => {
    const spy = createMockSpawn(1, false); // Exit code 1

    await expect(installPlugins("plugin1,plugin2,plugin3")).rejects.toThrow(
      "Failed to add marketplace (exit code: 1)",
    );

    // Should only try to add marketplace before failing
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("should handle plugins with special characters in names", async () => {
    const spy = createMockSpawn();
    await installPlugins("org/plugin-name,@scope/plugin");

    expect(spy).toHaveBeenCalledTimes(3);
    // First call: add marketplace
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      [
        "plugin",
        "marketplace",
        "add",
        "https://github.com/anthropics/claude-code.git",
      ],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      2,
      "claude",
      ["plugin", "install", "org/plugin-name"],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      3,
      "claude",
      ["plugin", "install", "@scope/plugin"],
      { stdio: "inherit" },
    );
  });

  test("should handle spawn errors", async () => {
    createMockSpawn(0, true); // Trigger error event

    await expect(installPlugins("test-plugin")).rejects.toThrow(
      "Failed to add marketplace: spawn error",
    );
  });

  test("should install plugins with custom executable and multiple plugins", async () => {
    const spy = createMockSpawn();
    await installPlugins("plugin-a,plugin-b", "/usr/local/bin/claude-custom");

    expect(spy).toHaveBeenCalledTimes(3);
    // First call: add marketplace
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "/usr/local/bin/claude-custom",
      [
        "plugin",
        "marketplace",
        "add",
        "https://github.com/anthropics/claude-code.git",
      ],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      2,
      "/usr/local/bin/claude-custom",
      ["plugin", "install", "plugin-a"],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      3,
      "/usr/local/bin/claude-custom",
      ["plugin", "install", "plugin-b"],
      { stdio: "inherit" },
    );
  });

  test("should reject plugin names with command injection attempts", async () => {
    const spy = createMockSpawn();

    // Should throw due to invalid characters (semicolon and spaces)
    await expect(installPlugins("plugin-name; rm -rf /")).rejects.toThrow(
      "Invalid plugin name format",
    );

    // Mock should never be called because validation fails first
    expect(spy).not.toHaveBeenCalled();
  });

  test("should reject plugin names with path traversal using ../", async () => {
    const spy = createMockSpawn();

    await expect(installPlugins("../../../malicious-plugin")).rejects.toThrow(
      "Invalid plugin name format",
    );

    expect(spy).not.toHaveBeenCalled();
  });

  test("should reject plugin names with path traversal using ./", async () => {
    const spy = createMockSpawn();

    await expect(installPlugins("./../../@scope/package")).rejects.toThrow(
      "Invalid plugin name format",
    );

    expect(spy).not.toHaveBeenCalled();
  });

  test("should reject plugin names with consecutive dots", async () => {
    const spy = createMockSpawn();

    await expect(installPlugins(".../.../package")).rejects.toThrow(
      "Invalid plugin name format",
    );

    expect(spy).not.toHaveBeenCalled();
  });

  test("should reject plugin names with hidden path traversal", async () => {
    const spy = createMockSpawn();

    await expect(installPlugins("package/../other")).rejects.toThrow(
      "Invalid plugin name format",
    );

    expect(spy).not.toHaveBeenCalled();
  });

  test("should accept plugin names with single dots in version numbers", async () => {
    const spy = createMockSpawn();
    await installPlugins("plugin-v1.0.2");

    expect(spy).toHaveBeenCalledTimes(2);
    // First call: add marketplace
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      [
        "plugin",
        "marketplace",
        "add",
        "https://github.com/anthropics/claude-code.git",
      ],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      2,
      "claude",
      ["plugin", "install", "plugin-v1.0.2"],
      { stdio: "inherit" },
    );
  });

  test("should accept plugin names with multiple dots in semantic versions", async () => {
    const spy = createMockSpawn();
    await installPlugins("@scope/plugin-v1.0.0-beta.1");

    expect(spy).toHaveBeenCalledTimes(2);
    // First call: add marketplace
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      [
        "plugin",
        "marketplace",
        "add",
        "https://github.com/anthropics/claude-code.git",
      ],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      2,
      "claude",
      ["plugin", "install", "@scope/plugin-v1.0.0-beta.1"],
      { stdio: "inherit" },
    );
  });

  test("should reject Unicode homoglyph path traversal attempts", async () => {
    const spy = createMockSpawn();

    // Using fullwidth dots (U+FF0E) and fullwidth solidus (U+FF0F)
    await expect(installPlugins("．．／malicious")).rejects.toThrow(
      "Invalid plugin name format",
    );

    expect(spy).not.toHaveBeenCalled();
  });

  test("should reject path traversal at end of path", async () => {
    const spy = createMockSpawn();

    await expect(installPlugins("package/..")).rejects.toThrow(
      "Invalid plugin name format",
    );

    expect(spy).not.toHaveBeenCalled();
  });

  test("should reject single dot directory reference", async () => {
    const spy = createMockSpawn();

    await expect(installPlugins("package/.")).rejects.toThrow(
      "Invalid plugin name format",
    );

    expect(spy).not.toHaveBeenCalled();
  });

  test("should reject path traversal in middle of path", async () => {
    const spy = createMockSpawn();

    await expect(installPlugins("package/../other")).rejects.toThrow(
      "Invalid plugin name format",
    );

    expect(spy).not.toHaveBeenCalled();
  });
});
