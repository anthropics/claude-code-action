import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("action metadata", () => {
  test("should expose the conclusion output from the run step", () => {
    const metadata = readFileSync(
      new URL("../action.yml", import.meta.url),
      "utf8",
    );

    expect(metadata).toMatch(
      /^  conclusion:\n    description: .+\n    value: \$\{\{ steps\.run\.outputs\.conclusion \}\}$/m,
    );
  });

  test("should keep restrict_untrusted_prs off by default and pass it to the run step", () => {
    const metadata = readFileSync(
      new URL("../action.yml", import.meta.url),
      "utf8",
    );

    expect(metadata).toMatch(
      /^  restrict_untrusted_prs:\n    description: .+\n    required: false\n    default: "false"$/m,
    );
    expect(metadata).toMatch(
      /^        RESTRICT_UNTRUSTED_PRS: \$\{\{ inputs\.restrict_untrusted_prs \}\}$/m,
    );
  });
});
