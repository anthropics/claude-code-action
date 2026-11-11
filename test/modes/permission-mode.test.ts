import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { defaultsToAutoMode } from "../../src/modes/permission-mode";

describe("defaultsToAutoMode", () => {
  const saved = process.env.ANTHROPIC_BASE_URL;
  const savedNonWriteUsers = process.env.ALLOWED_NON_WRITE_USERS;
  const savedSettings = process.env.INPUT_SETTINGS;

  beforeEach(() => {
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.ALLOWED_NON_WRITE_USERS;
    delete process.env.INPUT_SETTINGS;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = saved;
    if (savedNonWriteUsers === undefined) {
      delete process.env.ALLOWED_NON_WRITE_USERS;
    } else {
      process.env.ALLOWED_NON_WRITE_USERS = savedNonWriteUsers;
    }
    if (savedSettings === undefined) delete process.env.INPUT_SETTINGS;
    else process.env.INPUT_SETTINGS = savedSettings;
  });

  describe("settings input", () => {
    const useSettings = (settings: unknown) => {
      process.env.INPUT_SETTINGS = JSON.stringify(settings);
    };

    test("is on when settings set neither a mode nor a base URL", () => {
      useSettings({ model: "x", env: { OTHER: "1" }, permissions: {} });
      expect(defaultsToAutoMode()).toBe(true);
    });

    test("is off when settings choose another permission mode", () => {
      useSettings({ permissions: { defaultMode: "dontAsk" } });
      expect(defaultsToAutoMode()).toBe(false);
    });

    test("stays on when settings choose auto mode", () => {
      useSettings({ permissions: { defaultMode: "auto" } });
      expect(defaultsToAutoMode()).toBe(true);
    });

    test("is off when settings set a base URL", () => {
      useSettings({ env: { ANTHROPIC_BASE_URL: "https://gw.example.com" } });
      expect(defaultsToAutoMode()).toBe(false);
    });

    test("ignores a blank base URL in settings", () => {
      useSettings({ env: { ANTHROPIC_BASE_URL: "  " } });
      expect(defaultsToAutoMode()).toBe(true);
    });

    test("reads a settings file", () => {
      const dir = mkdtempSync(join(tmpdir(), "permission-mode-"));
      try {
        const file = join(dir, "settings.json");
        writeFileSync(
          file,
          JSON.stringify({ permissions: { defaultMode: "plan" } }),
        );
        process.env.INPUT_SETTINGS = file;
        expect(defaultsToAutoMode()).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("doesn't throw on a settings input it can't read", () => {
      process.env.INPUT_SETTINGS = "/no/such/settings.json";
      expect(defaultsToAutoMode()).toBe(true);
    });

    test("doesn't throw on settings JSON that isn't an object", () => {
      process.env.INPUT_SETTINGS = "null";
      expect(defaultsToAutoMode()).toBe(true);
    });
  });

  test("is on with no custom base URL", () => {
    expect(defaultsToAutoMode()).toBe(true);
  });

  test("treats the empty value action.yml passes as no base URL", () => {
    process.env.ANTHROPIC_BASE_URL = "  ";
    expect(defaultsToAutoMode()).toBe(true);
  });

  test("is off when non-write users are allowed", () => {
    process.env.ALLOWED_NON_WRITE_USERS = "*";
    expect(defaultsToAutoMode()).toBe(false);
  });

  test("treats the empty value action.yml passes as no allowed users", () => {
    process.env.ALLOWED_NON_WRITE_USERS = "";
    expect(defaultsToAutoMode()).toBe(true);
  });

  test("is off behind a custom base URL", () => {
    process.env.ANTHROPIC_BASE_URL = "https://gateway.example.com";
    expect(defaultsToAutoMode()).toBe(false);
  });
});
