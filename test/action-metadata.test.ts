import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("action metadata", () => {
  const metadata = readFileSync(
    new URL("../action.yml", import.meta.url),
    "utf8",
  );

  test("should expose the conclusion output from the run step", () => {
    expect(metadata).toMatch(
      /^  conclusion:\r?\n\s*description: .+\r?\n\s*value: \$\{\{ steps\.run\.outputs\.conclusion \}\}/m,
    );
  });

  test("bounds best-effort subprocess isolation dependency installation", () => {
    expect(metadata).toContain(
      '"${GITHUB_ACTION_PATH}/scripts/install-subprocess-isolation-dependencies.sh"',
    );
    expect(metadata).not.toContain("sudo apt-get update");
  });
});
