import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("action metadata", () => {
  test("exposes completion mention suppression as an opt-in run input", () => {
    const metadata = readFileSync(
      new URL("../action.yml", import.meta.url),
      "utf8",
    );

    expect(metadata).toMatch(
      /^  suppress_completion_mention:\n    description: .+\n    required: false\n    default: "false"$/m,
    );
    expect(metadata).toContain(
      "        SUPPRESS_COMPLETION_MENTION: ${{ inputs.suppress_completion_mention }}",
    );
  });

  test("should expose the conclusion output from the run step", () => {
    const metadata = readFileSync(
      new URL("../action.yml", import.meta.url),
      "utf8",
    );

    expect(metadata).toMatch(
      /^  conclusion:\n    description: .+\n    value: \$\{\{ steps\.run\.outputs\.conclusion \}\}$/m,
    );
  });
});
