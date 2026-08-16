import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { collectActionInputsPresence } from "../src/entrypoints/collect-inputs";

/**
 * The input map in collect-inputs.ts is hand-maintained, and action.yml is the
 * only source of truth for what an input is called and what it defaults to.
 * Nothing held the two together, so the map drifted: 11 inputs removed in the
 * v1.0 migration were still tracked and 19 current ones were missing, `prompt`
 * among them (#1664).
 *
 * These read action.yml at test time rather than restating its contents, so
 * adding or renaming an input fails here instead of silently producing a
 * usage signal that describes inputs nobody can set.
 */

/** Input names declared in action.yml, in declaration order. */
function declaredInputNames(): string[] {
  const metadata = readFileSync(
    new URL("../action.yml", import.meta.url),
    "utf8",
  );

  const start = metadata.indexOf("\ninputs:");
  if (start === -1) {
    throw new Error("action.yml has no inputs: block");
  }

  let block = metadata.slice(start + "\ninputs:".length);
  for (const stop of ["\nruns:", "\noutputs:", "\nbranding:"]) {
    const at = block.indexOf(stop);
    if (at !== -1) {
      block = block.slice(0, at);
    }
  }

  return block
    .split("\n")
    .map((line) => /^ {2}([a-z0-9_]+):\s*$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1] as string);
}

/** Input names the presence collector reports on. */
function trackedInputNames(): string[] {
  process.env.ALL_INPUTS = "{}";
  return Object.keys(JSON.parse(collectActionInputsPresence()));
}

describe("collectActionInputsPresence", () => {
  const originalAllInputs = process.env.ALL_INPUTS;

  afterEach(() => {
    if (originalAllInputs === undefined) {
      delete process.env.ALL_INPUTS;
    } else {
      process.env.ALL_INPUTS = originalAllInputs;
    }
  });

  test("tracks exactly the inputs action.yml declares", () => {
    expect(trackedInputNames().sort()).toEqual(declaredInputNames().sort());
  });

  test("tracks no input that action.yml no longer declares", () => {
    const declared = new Set(declaredInputNames());
    const stale = trackedInputNames().filter((name) => !declared.has(name));

    expect(stale).toEqual([]);
  });

  test("tracks prompt, which selects agent mode over tag mode", () => {
    // Called out separately because this is the input whose absence made the
    // signal actively misleading rather than merely incomplete.
    expect(trackedInputNames()).toContain("prompt");
  });

  describe("presence reporting", () => {
    beforeEach(() => {
      delete process.env.ALL_INPUTS;
    });

    test("reports an empty object when ALL_INPUTS is absent", () => {
      expect(JSON.parse(collectActionInputsPresence())).toEqual({});
    });

    test("reports an empty object when ALL_INPUTS is not valid JSON", () => {
      process.env.ALL_INPUTS = "{not json";

      expect(JSON.parse(collectActionInputsPresence())).toEqual({});
    });

    test("reports an input as present only when it differs from its default", () => {
      process.env.ALL_INPUTS = JSON.stringify({
        prompt: "review this",
        trigger_phrase: "@claude",
      });

      const presence = JSON.parse(collectActionInputsPresence());

      expect(presence.prompt).toBe(true);
      // equal to the action.yml default, so the user did not set it
      expect(presence.trigger_phrase).toBe(false);
    });
  });
});
