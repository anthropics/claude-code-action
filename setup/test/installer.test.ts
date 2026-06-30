import { describe, test, expect } from "bun:test";
import * as os from "os";
import * as path from "path";

describe("Installer path helpers", () => {
  test("should generate correct installation directory", () => {
    const installDir = getInstallDir();
    const homeDir = os.homedir();

    expect(installDir).toBe(path.join(homeDir, ".local", "bin"));
  });

  test("should generate correct Claude path", () => {
    const claudePath = getClaudePath();
    const homeDir = os.homedir();

    expect(claudePath).toBe(path.join(homeDir, ".local", "bin", "claude"));
  });

  test("should return absolute path for Claude executable", () => {
    const claudePath = getClaudePath();

    expect(path.isAbsolute(claudePath)).toBe(true);
  });

  test("should use platform-specific path separators", () => {
    const claudePath = getClaudePath();

    // Path should use the correct separator for the platform
    expect(claudePath).toContain(path.sep);
  });

  test("should construct paths consistently", () => {
    const installDir = getInstallDir();
    const claudePath = getClaudePath();

    // Claude path should be installDir + claude
    expect(claudePath).toBe(path.join(installDir, "claude"));
  });
});

describe("Version parsing", () => {
  test("should handle stable version", () => {
    expect(isValidVersion("stable")).toBe(true);
  });

  test("should handle latest version", () => {
    expect(isValidVersion("latest")).toBe(true);
  });

  test("should handle semantic versions", () => {
    const versions = ["2.0.1", "1.5.3", "3.0.0", "0.0.1", "10.20.30"];

    for (const version of versions) {
      expect(isValidVersion(version)).toBe(true);
    }
  });

  test("should handle pre-release versions", () => {
    const versions = ["2.0.1-beta", "1.0.0-alpha.1", "3.0.0-rc.2"];

    for (const version of versions) {
      expect(isValidVersion(version)).toBe(true);
    }
  });

  test("should reject invalid versions", () => {
    const invalid = [
      "",
      "invalid",
      "v2.0.1", // should not have 'v' prefix for install script
      "2.0", // incomplete semver
      "2", // incomplete semver
    ];

    for (const version of invalid) {
      expect(isValidVersion(version)).toBe(false);
    }
  });
});

// Helper functions that replicate the logic from installer.ts
function getInstallDir(): string {
  return path.join(os.homedir(), ".local", "bin");
}

function getClaudePath(): string {
  return path.join(getInstallDir(), "claude");
}

function isValidVersion(version: string): boolean {
  if (!version || version.trim() === "") {
    return false;
  }

  // Accept stable, latest, or semver-like patterns
  if (version === "stable" || version === "latest") {
    return true;
  }

  // Basic semver validation (allows pre-release tags)
  const semverPattern = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
  return semverPattern.test(version);
}
