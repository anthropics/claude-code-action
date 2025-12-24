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
    await installPlugins(undefined, "");
    expect(spy).not.toHaveBeenCalled();
  });

  test("should not call spawn when plugins is undefined", async () => {
    const spy = createMockSpawn();
    await installPlugins(undefined, undefined);
    expect(spy).not.toHaveBeenCalled();
  });

  test("should not call spawn when plugins is only whitespace", async () => {
    const spy = createMockSpawn();
    await installPlugins(undefined, "   ");
    expect(spy).not.toHaveBeenCalled();
  });

  test("should install a single plugin with default executable", async () => {
    const spy = createMockSpawn();
    await installPlugins(undefined, "test-plugin");

    expect(spy).toHaveBeenCalledTimes(1);
    // Only call: install plugin (no marketplace without explicit marketplace input)
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      ["plugin", "install", "test-plugin"],
      { stdio: "inherit" },
    );
  });

  test("should install multiple plugins sequentially", async () => {
    const spy = createMockSpawn();
    await installPlugins(undefined, "plugin1\nplugin2\nplugin3");

    expect(spy).toHaveBeenCalledTimes(3);
    // Install plugins (no marketplace without explicit marketplace input)
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      ["plugin", "install", "plugin1"],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      2,
      "claude",
      ["plugin", "install", "plugin2"],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      3,
      "claude",
      ["plugin", "install", "plugin3"],
      { stdio: "inherit" },
    );
  });

  test("should use custom claude executable path when provided", async () => {
    const spy = createMockSpawn();
    await installPlugins(undefined, "test-plugin", "/custom/path/to/claude");

    expect(spy).toHaveBeenCalledTimes(1);
    // Only call: install plugin (no marketplace without explicit marketplace input)
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "/custom/path/to/claude",
      ["plugin", "install", "test-plugin"],
      { stdio: "inherit" },
    );
  });

  test("should trim whitespace from plugin names before installation", async () => {
    const spy = createMockSpawn();
    await installPlugins(undefined, " plugin1 \n plugin2 ");

    expect(spy).toHaveBeenCalledTimes(2);
    // Install plugins (no marketplace without explicit marketplace input)
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      ["plugin", "install", "plugin1"],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      2,
      "claude",
      ["plugin", "install", "plugin2"],
      { stdio: "inherit" },
    );
  });

  test("should skip empty entries in plugin list", async () => {
    const spy = createMockSpawn();
    await installPlugins(undefined, "plugin1\n\nplugin2");

    expect(spy).toHaveBeenCalledTimes(2);
    // Install plugins (no marketplace without explicit marketplace input)
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      ["plugin", "install", "plugin1"],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      2,
      "claude",
      ["plugin", "install", "plugin2"],
      { stdio: "inherit" },
    );
  });

  test("should handle plugin installation error and throw", async () => {
    createMockSpawn(1, false); // Exit code 1

    await expect(installPlugins(undefined, "failing-plugin")).rejects.toThrow(
      "Failed to install plugin 'failing-plugin' (exit code: 1)",
    );
  });

  test("should handle null exit code (process terminated by signal)", async () => {
    createMockSpawn(null, false); // Exit code null (terminated by signal)

    await expect(
      installPlugins(undefined, "terminated-plugin"),
    ).rejects.toThrow(
      "Failed to install plugin 'terminated-plugin': process terminated by signal",
    );
  });

  test("should stop installation on first error", async () => {
    const spy = createMockSpawn(1, false); // Exit code 1

    await expect(
      installPlugins(undefined, "plugin1\nplugin2\nplugin3"),
    ).rejects.toThrow("Failed to install plugin 'plugin1' (exit code: 1)");

    // Should only try to install first plugin before failing
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("should handle plugins with special characters in names", async () => {
    const spy = createMockSpawn();
    await installPlugins(undefined, "org/plugin-name\n@scope/plugin");

    expect(spy).toHaveBeenCalledTimes(2);
    // Install plugins (no marketplace without explicit marketplace input)
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      ["plugin", "install", "org/plugin-name"],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      2,
      "claude",
      ["plugin", "install", "@scope/plugin"],
      { stdio: "inherit" },
    );
  });

  test("should handle spawn errors", async () => {
    createMockSpawn(0, true); // Trigger error event

    await expect(installPlugins(undefined, "test-plugin")).rejects.toThrow(
      "Failed to install plugin 'test-plugin': spawn error",
    );
  });

  test("should install plugins with custom executable and multiple plugins", async () => {
    const spy = createMockSpawn();
    await installPlugins(
      undefined,
      "plugin-a\nplugin-b",
      "/usr/local/bin/claude-custom",
    );

    expect(spy).toHaveBeenCalledTimes(2);
    // Install plugins (no marketplace without explicit marketplace input)
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "/usr/local/bin/claude-custom",
      ["plugin", "install", "plugin-a"],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      2,
      "/usr/local/bin/claude-custom",
      ["plugin", "install", "plugin-b"],
      { stdio: "inherit" },
    );
  });

  test("should reject plugin names with command injection attempts", async () => {
    const spy = createMockSpawn();

    // Should throw due to invalid characters (semicolon and spaces)
    await expect(
      installPlugins(undefined, "plugin-name; rm -rf /"),
    ).rejects.toThrow("Invalid plugin name format");

    // Mock should never be called because validation fails first
    expect(spy).not.toHaveBeenCalled();
  });

  test("should reject plugin names with path traversal using ../", async () => {
    const spy = createMockSpawn();

    await expect(
      installPlugins(undefined, "../../../malicious-plugin"),
    ).rejects.toThrow("Invalid plugin name format");

    expect(spy).not.toHaveBeenCalled();
  });

  test("should reject plugin names with path traversal using ./", async () => {
    const spy = createMockSpawn();

    await expect(
      installPlugins(undefined, "./../../@scope/package"),
    ).rejects.toThrow("Invalid plugin name format");

    expect(spy).not.toHaveBeenCalled();
  });

  test("should reject plugin names with consecutive dots", async () => {
    const spy = createMockSpawn();

    await expect(installPlugins(undefined, ".../.../package")).rejects.toThrow(
      "Invalid plugin name format",
    );

    expect(spy).not.toHaveBeenCalled();
  });

  test("should reject plugin names with hidden path traversal", async () => {
    const spy = createMockSpawn();

    await expect(installPlugins(undefined, "package/../other")).rejects.toThrow(
      "Invalid plugin name format",
    );

    expect(spy).not.toHaveBeenCalled();
  });

  test("should accept plugin names with single dots in version numbers", async () => {
    const spy = createMockSpawn();
    await installPlugins(undefined, "plugin-v1.0.2");

    expect(spy).toHaveBeenCalledTimes(1);
    // Only call: install plugin (no marketplace without explicit marketplace input)
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      ["plugin", "install", "plugin-v1.0.2"],
      { stdio: "inherit" },
    );
  });

  test("should accept plugin names with multiple dots in semantic versions", async () => {
    const spy = createMockSpawn();
    await installPlugins(undefined, "@scope/plugin-v1.0.0-beta.1");

    expect(spy).toHaveBeenCalledTimes(1);
    // Only call: install plugin (no marketplace without explicit marketplace input)
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      ["plugin", "install", "@scope/plugin-v1.0.0-beta.1"],
      { stdio: "inherit" },
    );
  });

  test("should reject Unicode homoglyph path traversal attempts", async () => {
    const spy = createMockSpawn();

    // Using fullwidth dots (U+FF0E) and fullwidth solidus (U+FF0F)
    await expect(installPlugins(undefined, "．．／malicious")).rejects.toThrow(
      "Invalid plugin name format",
    );

    expect(spy).not.toHaveBeenCalled();
  });

  test("should reject path traversal at end of path", async () => {
    const spy = createMockSpawn();

    await expect(installPlugins(undefined, "package/..")).rejects.toThrow(
      "Invalid plugin name format",
    );

    expect(spy).not.toHaveBeenCalled();
  });

  test("should reject single dot directory reference", async () => {
    const spy = createMockSpawn();

    await expect(installPlugins(undefined, "package/.")).rejects.toThrow(
      "Invalid plugin name format",
    );

    expect(spy).not.toHaveBeenCalled();
  });

  test("should reject path traversal in middle of path", async () => {
    const spy = createMockSpawn();

    await expect(installPlugins(undefined, "package/../other")).rejects.toThrow(
      "Invalid plugin name format",
    );

    expect(spy).not.toHaveBeenCalled();
  });

  // Marketplace functionality tests
  test("should add a single marketplace before installing plugins", async () => {
    const spy = createMockSpawn();
    await installPlugins(
      "https://github.com/user/marketplace.git",
      "test-plugin",
    );

    expect(spy).toHaveBeenCalledTimes(2);
    // First call: add marketplace
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      [
        "plugin",
        "marketplace",
        "add",
        "https://github.com/user/marketplace.git",
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

  test("should add multiple marketplaces with newline separation", async () => {
    const spy = createMockSpawn();
    await installPlugins(
      "https://github.com/user/m1.git\nhttps://github.com/user/m2.git",
      "test-plugin",
    );

    expect(spy).toHaveBeenCalledTimes(3); // 2 marketplaces + 1 plugin
    // First two calls: add marketplaces
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      ["plugin", "marketplace", "add", "https://github.com/user/m1.git"],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      2,
      "claude",
      ["plugin", "marketplace", "add", "https://github.com/user/m2.git"],
      { stdio: "inherit" },
    );
    // Third call: install plugin
    expect(spy).toHaveBeenNthCalledWith(
      3,
      "claude",
      ["plugin", "install", "test-plugin"],
      { stdio: "inherit" },
    );
  });

  test("should add marketplaces before installing multiple plugins", async () => {
    const spy = createMockSpawn();
    await installPlugins(
      "https://github.com/user/marketplace.git",
      "plugin1\nplugin2",
    );

    expect(spy).toHaveBeenCalledTimes(3); // 1 marketplace + 2 plugins
    // First call: add marketplace
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      [
        "plugin",
        "marketplace",
        "add",
        "https://github.com/user/marketplace.git",
      ],
      { stdio: "inherit" },
    );
    // Next calls: install plugins
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

  test("should handle only marketplaces without plugins", async () => {
    const spy = createMockSpawn();
    await installPlugins("https://github.com/user/marketplace.git", undefined);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      [
        "plugin",
        "marketplace",
        "add",
        "https://github.com/user/marketplace.git",
      ],
      { stdio: "inherit" },
    );
  });

  test("should skip empty marketplace entries", async () => {
    const spy = createMockSpawn();
    await installPlugins(
      "https://github.com/user/m1.git\n\nhttps://github.com/user/m2.git",
      "test-plugin",
    );

    expect(spy).toHaveBeenCalledTimes(3); // 2 marketplaces (skip empty) + 1 plugin
  });

  test("should trim whitespace from marketplace URLs", async () => {
    const spy = createMockSpawn();
    await installPlugins(
      "  https://github.com/user/marketplace.git  \n  https://github.com/user/m2.git  ",
      "test-plugin",
    );

    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      [
        "plugin",
        "marketplace",
        "add",
        "https://github.com/user/marketplace.git",
      ],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      2,
      "claude",
      ["plugin", "marketplace", "add", "https://github.com/user/m2.git"],
      { stdio: "inherit" },
    );
  });

  test("should reject invalid marketplace URL format", async () => {
    const spy = createMockSpawn();

    await expect(
      installPlugins("not-a-valid-url", "test-plugin"),
    ).rejects.toThrow("Invalid marketplace URL format");

    expect(spy).not.toHaveBeenCalled();
  });

  test("should reject marketplace URL without .git extension", async () => {
    const spy = createMockSpawn();

    await expect(
      installPlugins("https://github.com/user/marketplace", "test-plugin"),
    ).rejects.toThrow("Invalid marketplace URL format");

    expect(spy).not.toHaveBeenCalled();
  });

  test("should reject marketplace URL with non-https protocol", async () => {
    const spy = createMockSpawn();

    await expect(
      installPlugins("http://github.com/user/marketplace.git", "test-plugin"),
    ).rejects.toThrow("Invalid marketplace URL format");

    expect(spy).not.toHaveBeenCalled();
  });

  test("should skip whitespace-only marketplace input", async () => {
    const spy = createMockSpawn();
    await installPlugins("   ", "test-plugin");

    // Should skip marketplaces and only install plugin
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      ["plugin", "install", "test-plugin"],
      { stdio: "inherit" },
    );
  });

  test("should handle marketplace addition error", async () => {
    createMockSpawn(1, false); // Exit code 1

    await expect(
      installPlugins("https://github.com/user/marketplace.git", "test-plugin"),
    ).rejects.toThrow(
      "Failed to add marketplace 'https://github.com/user/marketplace.git' (exit code: 1)",
    );
  });

  test("should stop if marketplace addition fails before installing plugins", async () => {
    const spy = createMockSpawn(1, false); // Exit code 1

    await expect(
      installPlugins(
        "https://github.com/user/marketplace.git",
        "plugin1\nplugin2",
      ),
    ).rejects.toThrow("Failed to add marketplace");

    // Should only try to add marketplace, not install any plugins
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("should use custom executable for marketplace operations", async () => {
    const spy = createMockSpawn();
    await installPlugins(
      "https://github.com/user/marketplace.git",
      "test-plugin",
      "/custom/path/to/claude",
    );

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "/custom/path/to/claude",
      [
        "plugin",
        "marketplace",
        "add",
        "https://github.com/user/marketplace.git",
      ],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      2,
      "/custom/path/to/claude",
      ["plugin", "install", "test-plugin"],
      { stdio: "inherit" },
    );
  });

  // Local marketplace path tests
  test("should accept local marketplace path with ./", async () => {
    const spy = createMockSpawn();
    await installPlugins("./my-local-marketplace", "test-plugin");

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      ["plugin", "marketplace", "add", "./my-local-marketplace"],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      2,
      "claude",
      ["plugin", "install", "test-plugin"],
      { stdio: "inherit" },
    );
  });

  test("should accept local marketplace path with absolute Unix path", async () => {
    const spy = createMockSpawn();
    await installPlugins("/home/user/my-marketplace", "test-plugin");

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      ["plugin", "marketplace", "add", "/home/user/my-marketplace"],
      { stdio: "inherit" },
    );
  });

  test("should accept local marketplace path with Windows absolute path", async () => {
    const spy = createMockSpawn();
    await installPlugins("C:\\Users\\user\\marketplace", "test-plugin");

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      ["plugin", "marketplace", "add", "C:\\Users\\user\\marketplace"],
      { stdio: "inherit" },
    );
  });

  test("should accept mixed local and remote marketplaces", async () => {
    const spy = createMockSpawn();
    await installPlugins(
      "./local-marketplace\nhttps://github.com/user/remote.git",
      "test-plugin",
    );

    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      ["plugin", "marketplace", "add", "./local-marketplace"],
      { stdio: "inherit" },
    );
    expect(spy).toHaveBeenNthCalledWith(
      2,
      "claude",
      ["plugin", "marketplace", "add", "https://github.com/user/remote.git"],
      { stdio: "inherit" },
    );
  });

  test("should accept local path with ../ (parent directory)", async () => {
    const spy = createMockSpawn();
    await installPlugins("../shared-plugins/marketplace", "test-plugin");

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      ["plugin", "marketplace", "add", "../shared-plugins/marketplace"],
      { stdio: "inherit" },
    );
  });

  test("should accept local path with nested directories", async () => {
    const spy = createMockSpawn();
    await installPlugins("./plugins/my-org/my-marketplace", "test-plugin");

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      ["plugin", "marketplace", "add", "./plugins/my-org/my-marketplace"],
      { stdio: "inherit" },
    );
  });

  test("should accept local path with dots in directory name", async () => {
    const spy = createMockSpawn();
    await installPlugins("./my.plugin.marketplace", "test-plugin");

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(
      1,
      "claude",
      ["plugin", "marketplace", "add", "./my.plugin.marketplace"],
      { stdio: "inherit" },
    );
  });
});
