import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { defaultsToAutoMode } from "../../src/modes/permission-mode";

describe("defaultsToAutoMode", () => {
  const saved = process.env.ANTHROPIC_BASE_URL;

  beforeEach(() => {
    delete process.env.ANTHROPIC_BASE_URL;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = saved;
  });

  test("is on with no custom base URL", () => {
    expect(defaultsToAutoMode()).toBe(true);
  });

  test("treats the empty value action.yml passes as no base URL", () => {
    process.env.ANTHROPIC_BASE_URL = "  ";
    expect(defaultsToAutoMode()).toBe(true);
  });

  test("is off behind a custom base URL", () => {
    process.env.ANTHROPIC_BASE_URL = "https://gateway.example.com";
    expect(defaultsToAutoMode()).toBe(false);
  });
});
