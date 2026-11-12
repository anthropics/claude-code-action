import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { defaultsToAutoMode } from "../../src/modes/permission-mode";

describe("defaultsToAutoMode", () => {
  const saved = process.env.ANTHROPIC_BASE_URL;
  const savedNonWriteUsers = process.env.ALLOWED_NON_WRITE_USERS;
  const savedSettings = process.env.INPUT_SETTINGS;
  const savedBots = process.env.ALLOWED_BOTS;
  const savedExecutable = process.env.PATH_TO_CLAUDE_CODE_EXECUTABLE;

  beforeEach(() => {
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.ALLOWED_NON_WRITE_USERS;
    delete process.env.INPUT_SETTINGS;
    delete process.env.ALLOWED_BOTS;
    delete process.env.PATH_TO_CLAUDE_CODE_EXECUTABLE;
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
    if (savedBots === undefined) delete process.env.ALLOWED_BOTS;
    else process.env.ALLOWED_BOTS = savedBots;
    if (savedExecutable === undefined) {
      delete process.env.PATH_TO_CLAUDE_CODE_EXECUTABLE;
    } else {
      process.env.PATH_TO_CLAUDE_CODE_EXECUTABLE = savedExecutable;
    }
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

    test("is off for a settings file, whatever it holds", () => {
      process.env.INPUT_SETTINGS = "/no/such/settings.json";
      expect(defaultsToAutoMode()).toBe(false);
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

  test("is off when bots are allowed", () => {
    process.env.ALLOWED_BOTS = "sentry[bot]";
    expect(defaultsToAutoMode()).toBe(false);
  });

  test("treats the empty value action.yml passes as no allowed bots", () => {
    process.env.ALLOWED_BOTS = "";
    expect(defaultsToAutoMode()).toBe(true);
  });

  test("treats the empty value action.yml passes as no allowed users", () => {
    process.env.ALLOWED_NON_WRITE_USERS = "";
    expect(defaultsToAutoMode()).toBe(true);
  });

  test("is off with a custom Claude Code executable", () => {
    process.env.PATH_TO_CLAUDE_CODE_EXECUTABLE = "/opt/claude";
    expect(defaultsToAutoMode()).toBe(false);
  });

  test("treats the empty value action.yml passes as no custom executable", () => {
    process.env.PATH_TO_CLAUDE_CODE_EXECUTABLE = "";
    expect(defaultsToAutoMode()).toBe(true);
  });

  test("is off behind a custom base URL", () => {
    process.env.ANTHROPIC_BASE_URL = "https://gateway.example.com";
    expect(defaultsToAutoMode()).toBe(false);
  });
});
