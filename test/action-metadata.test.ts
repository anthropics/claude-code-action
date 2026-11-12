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

  test("should keep restrict_untrusted_prs on by default and pass it to the run step", () => {
    const metadata = readFileSync(
      new URL("../action.yml", import.meta.url),
      "utf8",
    );

    expect(metadata).toMatch(
      /^  restrict_untrusted_prs:\n    description: .+\n    required: false\n    default: "true"$/m,
    );
    expect(metadata).toMatch(
      /^        RESTRICT_UNTRUSTED_PRS: \$\{\{ inputs\.restrict_untrusted_prs \}\}$/m,
    );
  });

  test("should not put step outputs into shell scripts", () => {
    // A session can write step outputs, so an expression in a script could run
    // its commands. Scripts have to read these values from the environment.
    const lines = readFileSync(
      new URL("../action.yml", import.meta.url),
      "utf8",
    ).split("\n");
    const inScripts: string[] = [];
    let scriptIndent: number | null = null;
    for (const line of lines) {
      const indent = line.search(/\S/);
      if (scriptIndent !== null && indent !== -1 && indent <= scriptIndent) {
        scriptIndent = null;
      }
      if (scriptIndent !== null && line.includes("${{ steps.")) {
        inScripts.push(line.trim());
      }
      const run = line.match(/^(\s*)run: \|/);
      if (run) scriptIndent = run[1]!.length;
    }
    expect(inScripts).toEqual([]);
  });
});
