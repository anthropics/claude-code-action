import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { collectActionInputsPresence } from "../src/entrypoints/collect-inputs";

// The full default map the function compares against. Passing exactly these
// values must yield all-false; this is what kills the string-literal mutants
// on every default (any mutated default would flip its field to true).
const INPUT_DEFAULTS: Record<string, string> = {
  trigger_phrase: "@claude",
  assignee_trigger: "",
  label_trigger: "claude",
  base_branch: "",
  branch_prefix: "claude/",
  allowed_bots: "",
  mode: "tag",
  model: "",
  anthropic_model: "",
  fallback_model: "",
  allowed_tools: "",
  disallowed_tools: "",
  custom_instructions: "",
  direct_prompt: "",
  override_prompt: "",
  additional_permissions: "",
  claude_env: "",
  settings: "",
  anthropic_api_key: "",
  claude_code_oauth_token: "",
  anthropic_federation_rule_id: "",
  anthropic_organization_id: "",
  anthropic_service_account_id: "",
  anthropic_workspace_id: "",
  anthropic_oidc_audience: "",
  github_token: "",
  max_turns: "",
  use_sticky_comment: "false",
  classify_inline_comments: "true",
  use_commit_signing: "false",
  ssh_signing_key: "",
};

const originalAllInputs = process.env.ALL_INPUTS;

let consoleLogSpy: ReturnType<typeof spyOn<typeof console, "log">>;
let consoleErrorSpy: ReturnType<typeof spyOn<typeof console, "error">>;

beforeEach(() => {
  delete process.env.ALL_INPUTS;
  consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
  consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();
  if (originalAllInputs === undefined) {
    delete process.env.ALL_INPUTS;
  } else {
    process.env.ALL_INPUTS = originalAllInputs;
  }
});

describe("collectActionInputsPresence", () => {
  test("returns {} and logs when ALL_INPUTS is not set", () => {
    const result = collectActionInputsPresence();

    expect(result).toBe("{}");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "ALL_INPUTS environment variable not found",
    );
  });

  test("returns {} and logs the error when ALL_INPUTS is not valid JSON", () => {
    process.env.ALL_INPUTS = "{not-json";

    const result = collectActionInputsPresence();

    expect(result).toBe("{}");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to parse ALL_INPUTS JSON:",
      expect.any(Error),
    );
  });

  test("marks every input as not-set when all values equal the defaults", () => {
    process.env.ALL_INPUTS = JSON.stringify(INPUT_DEFAULTS);

    const parsed = JSON.parse(collectActionInputsPresence()) as Record<
      string,
      boolean
    >;

    // Every known input must be present in the output and false.
    expect(Object.keys(parsed).sort()).toEqual(
      Object.keys(INPUT_DEFAULTS).sort(),
    );
    for (const name of Object.keys(INPUT_DEFAULTS)) {
      expect(parsed[name]).toBe(false);
    }
  });

  test("marks every input as not-set when ALL_INPUTS is an empty object", () => {
    // Missing keys fall back to "" via `allInputs[name] || ""`. Fields whose
    // default is "" stay false; fields with a non-empty default flip to true.
    process.env.ALL_INPUTS = JSON.stringify({});

    const parsed = JSON.parse(collectActionInputsPresence()) as Record<
      string,
      boolean
    >;

    expect(parsed.assignee_trigger).toBe(false); // default ""
    expect(parsed.trigger_phrase).toBe(true); // default "@claude" -> "" !== "@claude"
    expect(parsed.label_trigger).toBe(true); // default "claude"
    expect(parsed.mode).toBe(true); // default "tag"
    expect(parsed.use_sticky_comment).toBe(true); // default "false"
    expect(parsed.classify_inline_comments).toBe(true); // default "true"
  });

  test("detects an explicitly changed value as set", () => {
    process.env.ALL_INPUTS = JSON.stringify({
      ...INPUT_DEFAULTS,
      trigger_phrase: "@assistant",
      mode: "agent",
      use_sticky_comment: "true",
    });

    const parsed = JSON.parse(collectActionInputsPresence()) as Record<
      string,
      boolean
    >;

    expect(parsed.trigger_phrase).toBe(true);
    expect(parsed.mode).toBe(true);
    expect(parsed.use_sticky_comment).toBe(true);
    // Untouched fields stay false.
    expect(parsed.label_trigger).toBe(false);
    expect(parsed.classify_inline_comments).toBe(false);
  });

  test("treats a value equal to a non-empty default as not-set", () => {
    process.env.ALL_INPUTS = JSON.stringify({
      ...INPUT_DEFAULTS,
      branch_prefix: "claude/",
      classify_inline_comments: "true",
    });

    const parsed = JSON.parse(collectActionInputsPresence()) as Record<
      string,
      boolean
    >;

    expect(parsed.branch_prefix).toBe(false);
    expect(parsed.classify_inline_comments).toBe(false);
  });

  test("treats an explicitly empty value for a non-empty default as set", () => {
    process.env.ALL_INPUTS = JSON.stringify({
      ...INPUT_DEFAULTS,
      label_trigger: "",
    });

    const parsed = JSON.parse(collectActionInputsPresence()) as Record<
      string,
      boolean
    >;

    expect(parsed.label_trigger).toBe(true);
  });

  test("ignores unknown keys not in the defaults map", () => {
    process.env.ALL_INPUTS = JSON.stringify({
      ...INPUT_DEFAULTS,
      not_a_real_input: "whatever",
    });

    const parsed = JSON.parse(collectActionInputsPresence()) as Record<
      string,
      boolean
    >;

    expect("not_a_real_input" in parsed).toBe(false);
  });
});
