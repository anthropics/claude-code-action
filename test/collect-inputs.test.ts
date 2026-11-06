import { afterEach, describe, expect, test } from "bun:test";
import { collectActionInputsPresence } from "../src/entrypoints/collect-inputs";

const originalInputs = process.env.ALL_INPUTS;
afterEach(() => {
  if (originalInputs === undefined) delete process.env.ALL_INPUTS;
  else process.env.ALL_INPUTS = originalInputs;
});

describe("completion mention input presence", () => {
  for (const value of ["false", "true"]) {
    test(`suppress_completion_mention=${value} is compared with its default`, () => {
      process.env.ALL_INPUTS = JSON.stringify({
        suppress_completion_mention: value,
      });
      const presence = JSON.parse(collectActionInputsPresence());
      expect(presence.suppress_completion_mention).toBe(value === "true");
    });
  }
});
