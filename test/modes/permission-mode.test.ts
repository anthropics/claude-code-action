import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { defaultsToAutoMode } from "../../src/modes/permission-mode";

describe("defaultsToAutoMode", () => {
  const saved = process.env.ANTHROPIC_BASE_URL;
  const savedNonWriteUsers = process.env.ALLOWED_NON_WRITE_USERS;

  beforeEach(() => {
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.ALLOWED_NON_WRITE_USERS;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = saved;
    if (savedNonWriteUsers === undefined) {
      delete process.env.ALLOWED_NON_WRITE_USERS;
    } else {
      process.env.ALLOWED_NON_WRITE_USERS = savedNonWriteUsers;
    }
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
