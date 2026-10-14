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

  test("should install Bun at the version from the bun_version input", () => {
    const metadata = readFileSync(
      new URL("../action.yml", import.meta.url),
      "utf8",
    );

    // The setup-bun step must honor the bun_version input instead of a
    // hardcoded version. See issue #1714.
    expect(metadata).toMatch(/bun-version: \$\{\{ inputs\.bun_version \}\}/);
    expect(metadata).toMatch(
      /^  bun_version:\n    description: .+\n    required: false\n    default: "1\.3\.14"$/m,
    );
  });
});
