import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { loadEnv } from "../src/gitlab/utils/env";

const REQUIRED_ENV = {
  GITLAB_BASE_URL: "https://gitlab.example.com",
  GITLAB_PROJECT_ID: "123",
  GITLAB_ACCESS_TOKEN: "token",
  CI_MERGE_REQUEST_IID: "42",
  ANTHROPIC_API_KEY: "sk-ant-test",
};

describe("loadEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...REQUIRED_ENV };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("loads valid environment configuration", () => {
    const env = loadEnv();
    expect(env.GITLAB_BASE_URL).toBe(REQUIRED_ENV.GITLAB_BASE_URL);
    expect(env.CLAUDE_MODEL).toBe("claude-3-5-sonnet-20241022");
  });

  it("throws when required variables are missing", () => {
    delete process.env.GITLAB_ACCESS_TOKEN;
    expect(() => loadEnv()).toThrow(/GITLAB_ACCESS_TOKEN/);
  });

  it("validates Anthropic key format", () => {
    process.env.ANTHROPIC_API_KEY = "invalid";
    expect(() => loadEnv()).toThrow(/ANTHROPIC_API_KEY/);
  });
});

