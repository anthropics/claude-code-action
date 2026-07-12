import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { collectActionInputsPresence } from "../src/entrypoints/collect-inputs";

// collectActionInputsPresence() reports, per known action input, whether its
// value differs from the input's default — the "did the user set this?" signal
// consumed by the prepare phase. It reads process.env.ALL_INPUTS (the JSON the
// composite action assembles) and must degrade cleanly when that's missing or
// malformed rather than throwing mid-prepare.
describe("collectActionInputsPresence", () => {
  const original = process.env.ALL_INPUTS;
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    if (original === undefined) delete process.env.ALL_INPUTS;
    else process.env.ALL_INPUTS = original;
  });

  test("missing ALL_INPUTS → empty object, no throw", () => {
    delete process.env.ALL_INPUTS;
    expect(collectActionInputsPresence()).toBe("{}");
    expect(logSpy).toHaveBeenCalled();
  });

  test("malformed ALL_INPUTS JSON → empty object, logs, no throw", () => {
    process.env.ALL_INPUTS = "{not valid json";
    expect(collectActionInputsPresence()).toBe("{}");
    expect(errorSpy).toHaveBeenCalled();
  });

  test("a value equal to its default is reported as not set", () => {
    process.env.ALL_INPUTS = JSON.stringify({
      trigger_phrase: "@claude", // default
      label_trigger: "claude", // default
      mode: "tag", // default
      use_commit_signing: "false", // default
      anthropic_api_key: "", // default (empty)
    });
    const out = JSON.parse(collectActionInputsPresence());
    expect(out.trigger_phrase).toBe(false);
    expect(out.label_trigger).toBe(false);
    expect(out.mode).toBe(false);
    expect(out.use_commit_signing).toBe(false);
    expect(out.anthropic_api_key).toBe(false);
  });

  test("a value different from its default is reported as set", () => {
    process.env.ALL_INPUTS = JSON.stringify({
      trigger_phrase: "/hey-claude",
      mode: "agent",
      model: "claude-sonnet-4",
      use_commit_signing: "true",
    });
    const out = JSON.parse(collectActionInputsPresence());
    expect(out.trigger_phrase).toBe(true);
    expect(out.mode).toBe(true);
    expect(out.model).toBe(true);
    expect(out.use_commit_signing).toBe(true);
  });

  test("unknown keys are ignored; only known inputs are reported", () => {
    process.env.ALL_INPUTS = JSON.stringify({ some_unknown_input: "x" });
    const out = JSON.parse(collectActionInputsPresence());
    expect(out).not.toHaveProperty("some_unknown_input");
    // Known keys are always present in the map (as booleans).
    expect(typeof out.mode).toBe("boolean");
    // Empty-default inputs left unset stay false…
    expect(out.anthropic_api_key).toBe(false);
    // …while a non-empty-default input left unset differs from its default,
    // so the differs-from-default rule reports it as set.
    expect(out.branch_prefix).toBe(true);
  });
});
