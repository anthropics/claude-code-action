import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { parseAdditionalPermissions } from "../src/github/token";

describe("parseAdditionalPermissions", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.ADDITIONAL_PERMISSIONS;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ADDITIONAL_PERMISSIONS;
    } else {
      process.env.ADDITIONAL_PERMISSIONS = originalEnv;
    }
  });

  test("returns undefined when env var is not set", () => {
    delete process.env.ADDITIONAL_PERMISSIONS;
    expect(parseAdditionalPermissions()).toBeUndefined();
  });

  test("returns undefined when env var is empty string", () => {
    process.env.ADDITIONAL_PERMISSIONS = "";
    expect(parseAdditionalPermissions()).toBeUndefined();
  });

  test("returns undefined when env var is only whitespace", () => {
    process.env.ADDITIONAL_PERMISSIONS = "   \n  \n  ";
    expect(parseAdditionalPermissions()).toBeUndefined();
  });

  test("parses single permission and merges with defaults", () => {
    process.env.ADDITIONAL_PERMISSIONS = "actions: read";
    expect(parseAdditionalPermissions()).toEqual({
      contents: "write",
      pull_requests: "write",
      issues: "write",
      actions: "read",
    });
  });

  test("parses multiple permissions", () => {
    process.env.ADDITIONAL_PERMISSIONS = "actions: read\nworkflows: write";
    expect(parseAdditionalPermissions()).toEqual({
      contents: "write",
      pull_requests: "write",
      issues: "write",
      actions: "read",
      workflows: "write",
    });
  });

  test("additional permissions can override defaults", () => {
    process.env.ADDITIONAL_PERMISSIONS = "contents: read";
    expect(parseAdditionalPermissions()).toEqual({
      contents: "read",
      pull_requests: "write",
      issues: "write",
    });
  });

  test("handles extra whitespace around keys and values", () => {
    process.env.ADDITIONAL_PERMISSIONS = "  actions :  read  ";
    expect(parseAdditionalPermissions()).toEqual({
      contents: "write",
      pull_requests: "write",
      issues: "write",
      actions: "read",
    });
  });

  test("skips empty lines", () => {
    process.env.ADDITIONAL_PERMISSIONS =
      "actions: read\n\n\nworkflows: write\n\n";
    expect(parseAdditionalPermissions()).toEqual({
      contents: "write",
      pull_requests: "write",
      issues: "write",
      actions: "read",
      workflows: "write",
    });
  });

  test("skips lines without colons", () => {
    process.env.ADDITIONAL_PERMISSIONS =
      "actions: read\ninvalid line\nworkflows: write";
    expect(parseAdditionalPermissions()).toEqual({
      contents: "write",
      pull_requests: "write",
      issues: "write",
      actions: "read",
      workflows: "write",
    });
  });
});
