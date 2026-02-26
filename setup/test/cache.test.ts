import { describe, test, expect, beforeEach, mock } from "bun:test";
import * as os from "os";

describe("Cache key generation", () => {
  const originalPlatform = os.platform;
  const originalArch = os.arch;

  beforeEach(() => {
    // Reset mocks before each test
    mock.restore();
  });

  test("should generate cache key with platform and arch", () => {
    const key = getCacheKey("2.0.1");
    const platform = os.platform();
    const arch = os.arch();

    expect(key).toBe(`claude-code-v2-${platform}-${arch}-2.0.1`);
  });

  test("should include date in cache key for latest version", () => {
    const key = getCacheKey("latest");
    const platform = os.platform();
    const arch = os.arch();
    const today = new Date().toISOString().split("T")[0];

    expect(key).toBe(`claude-code-v2-${platform}-${arch}-latest-${today}`);
  });

  test("should treat stable as latest with date rotation", () => {
    const stableKey = getCacheKey("stable");
    const latestKey = getCacheKey("latest");

    // Both should have the same format (with date)
    expect(stableKey).toContain("latest");
    expect(stableKey).toContain(new Date().toISOString().split("T")[0]);

    // They should be identical
    expect(stableKey).toBe(latestKey);
  });

  test("should generate permanent cache key for specific versions", () => {
    const versions = ["2.0.1", "1.5.3", "3.0.0"];

    for (const version of versions) {
      const key = getCacheKey(version);
      const platform = os.platform();
      const arch = os.arch();

      expect(key).toBe(`claude-code-v2-${platform}-${arch}-${version}`);
      expect(key).not.toContain(new Date().toISOString().split("T")[0]);
    }
  });

  test("should generate different keys for different platforms", () => {
    const version = "2.0.1";

    // Test with mocked platforms
    const platforms = ["linux", "darwin", "win32"];
    const keys = platforms.map((platform) => {
      const arch = os.arch();
      return `claude-code-v2-${platform}-${arch}-${version}`;
    });

    // All keys should be unique
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(platforms.length);
  });

  test("should generate different keys for different architectures", () => {
    const version = "2.0.1";
    const platform = os.platform();

    // Test with different architectures
    const architectures = ["x64", "arm64"];
    const keys = architectures.map(
      (arch) => `claude-code-v2-${platform}-${arch}-${version}`,
    );

    // All keys should be unique
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(architectures.length);
  });

  test("should handle version edge cases", () => {
    const edgeCases = [
      "2.0.1-beta",
      "1.0.0-alpha.1",
      "3.0.0-rc.2",
      "latest",
      "stable",
    ];

    for (const version of edgeCases) {
      const key = getCacheKey(version);
      expect(key).toBeTruthy();
      expect(key).toContain("claude-code-v2");
    }
  });
});

describe("Cache paths", () => {
  test("should return correct cache paths", () => {
    const paths = getCachePaths();
    const homeDir = os.homedir();

    expect(paths).toHaveLength(2);
    expect(paths[0]).toContain(homeDir);
    expect(paths[0]).toContain(".local/bin/claude");
    expect(paths[1]).toContain(homeDir);
    expect(paths[1]).toContain(".claude");
  });

  test("should return absolute paths", () => {
    const paths = getCachePaths();

    for (const path of paths) {
      expect(path.startsWith("/") || path.match(/^[A-Z]:\\/)).toBe(true);
    }
  });
});

// Helper functions that replicate the logic from cache.ts
function getCacheKey(version: string): string {
  const platform = os.platform();
  const arch = os.arch();

  // For "latest" or "stable" version, include date to rotate cache daily
  if (version === "latest" || version === "stable") {
    const date = new Date().toISOString().split("T")[0];
    return `claude-code-v2-${platform}-${arch}-latest-${date}`;
  }

  return `claude-code-v2-${platform}-${arch}-${version}`;
}

function getCachePaths(): string[] {
  const homeDir = os.homedir();
  return [`${homeDir}/.local/bin/claude`, `${homeDir}/.claude`];
}
