import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("action metadata", () => {
  test("should expose the conclusion output from the run step", () => {
    const metadata = readFileSync(
      new URL("../action.yml", import.meta.url),
      "utf8",
    );

    expect(metadata).toMatch(
      /^  conclusion:\r?\n\s*description: .+\r?\n\s*value: \$\{\{ steps\.run\.outputs\.conclusion \}\}/m,
    );
  });
});
