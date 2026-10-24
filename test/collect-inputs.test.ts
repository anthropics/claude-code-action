import { afterEach, describe, expect, test } from "bun:test";
import { collectActionInputsPresence } from "../src/entrypoints/collect-inputs";

describe("collectActionInputsPresence", () => {
  const originalEnv = process.env.ALL_INPUTS;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ALL_INPUTS;
    } else {
      process.env.ALL_INPUTS = originalEnv;
    }
  });

  test("returns empty object string when ALL_INPUTS is not set", () => {
    delete process.env.ALL_INPUTS;
    const result = JSON.parse(collectActionInputsPresence());
    expect(result).toEqual({});
  });

  test("returns empty object string when ALL_INPUTS contains invalid JSON", () => {
    process.env.ALL_INPUTS = "{ invalid json";
    const result = JSON.parse(collectActionInputsPresence());
    expect(result).toEqual({});
  });

  test("correctly flags default values as false", () => {
    process.env.ALL_INPUTS = JSON.stringify({
      trigger_phrase: "@claude",
      label_trigger: "claude",
      branch_prefix: "claude/",
      use_sticky_comment: "false",
      classify_inline_comments: "true",
      use_commit_signing: "false",
      use_bedrock: "false",
      show_full_output: "false",
      display_report: "true",
      include_fix_links: "true",
      bot_name: "claude",
    });

    const result = JSON.parse(collectActionInputsPresence());
    expect(result.trigger_phrase).toBe(false);
    expect(result.label_trigger).toBe(false);
    expect(result.branch_prefix).toBe(false);
    expect(result.use_sticky_comment).toBe(false);
    expect(result.classify_inline_comments).toBe(false);
    expect(result.use_commit_signing).toBe(false);
    expect(result.use_bedrock).toBe(false);
    expect(result.show_full_output).toBe(false);
    expect(result.display_report).toBe(false);
    expect(result.include_fix_links).toBe(false);
    expect(result.bot_name).toBe(false);
  });

  test("correctly handles boolean types in parsed ALL_INPUTS without coercion bug", () => {
    // When inputs are parsed from JSON, booleans like false must NOT be coerced to '' and falsely marked as set
    process.env.ALL_INPUTS = JSON.stringify({
      use_sticky_comment: false,
      use_commit_signing: false,
      use_bedrock: false,
      show_full_output: false,
      track_progress: false,
      classify_inline_comments: true,
      include_fix_links: true,
      display_report: true,
    });

    const result = JSON.parse(collectActionInputsPresence());
    expect(result.use_sticky_comment).toBe(false);
    expect(result.use_commit_signing).toBe(false);
    expect(result.use_bedrock).toBe(false);
    expect(result.show_full_output).toBe(false);
    expect(result.track_progress).toBe(false);
    expect(result.classify_inline_comments).toBe(false);
    expect(result.include_fix_links).toBe(false);
    expect(result.display_report).toBe(false);
  });

  test("correctly identifies customized inputs", () => {
    process.env.ALL_INPUTS = JSON.stringify({
      prompt: "Fix the bug in parser",
      plugins: "@custom/plugin",
      show_full_output: "true",
      use_bedrock: "true",
      trigger_phrase: "@mybot",
      branch_name_template: "{entity}-{number}",
      allowed_non_write_users: "contributor1,contributor2",
      claude_args: "--verbose",
    });

    const result = JSON.parse(collectActionInputsPresence());
    expect(result.prompt).toBe(true);
    expect(result.plugins).toBe(true);
    expect(result.show_full_output).toBe(true);
    expect(result.use_bedrock).toBe(true);
    expect(result.trigger_phrase).toBe(true);
    expect(result.branch_name_template).toBe(true);
    expect(result.allowed_non_write_users).toBe(true);
    expect(result.claude_args).toBe(true);
  });

  test("identifies custom inputs not present in standard defaults", () => {
    process.env.ALL_INPUTS = JSON.stringify({
      custom_experimental_flag: "enabled",
      empty_custom_flag: "",
    });

    const result = JSON.parse(collectActionInputsPresence());
    expect(result.custom_experimental_flag).toBe(true);
    expect(result.empty_custom_flag).toBe(false);
  });
});
