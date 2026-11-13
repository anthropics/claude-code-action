import { describe, expect, test } from "bun:test";
import { Glob, YAML } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

function scan(pattern: string): string[] {
  return [...new Glob(pattern).scanSync({ cwd: root, dot: true })].sort();
}

function yamlFences(markdown: string): string[] {
  return [...markdown.matchAll(/^```ya?ml\n([\s\S]*?)^```/gm)].map(
    (match) => match[1]!,
  );
}

function runScripts(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(runScripts);
  if (node === null || typeof node !== "object") return [];
  return Object.entries(node).flatMap(([key, value]) =>
    key === "run" && typeof value === "string" ? [value] : runScripts(value),
  );
}

// GitHub puts a ${{ }} value into the script before the shell reads it, so
// Claude's answer must reach a script through env instead.
function unsafeScripts(yaml: string): string[] {
  return runScripts(YAML.parse(yaml)).filter((script) =>
    /\$\{\{(?:(?!\}\})[\s\S])*structured_output/i.test(script),
  );
}

describe("structured_output in shell scripts", () => {
  test("the check finds a value written into a script", () => {
    expect(
      unsafeScripts(
        "steps:\n  - run: |\n      OUTPUT='${{ steps.x.outputs.structured_output }}'\n",
      ),
    ).toHaveLength(1);
    expect(
      unsafeScripts(
        "steps:\n  - run: echo ${{ format('{0}', steps.x.outputs.structured_output) }}\n",
      ),
    ).toHaveLength(1);
    expect(
      unsafeScripts(
        'steps:\n  - env:\n      OUTPUT: ${{ steps.x.outputs.structured_output }}\n    run: echo "$OUTPUT"\n',
      ),
    ).toHaveLength(0);
  });

  test.each([
    ...scan("examples/*.{yml,yaml}"),
    ...scan("base-action/examples/*.{yml,yaml}"),
    ...scan(".github/workflows/*.{yml,yaml}"),
  ])("%s does not write it into a script", (file) => {
    expect(unsafeScripts(readFileSync(join(root, file), "utf8"))).toEqual([]);
  });

  test.each(["README.md", "base-action/README.md", ...scan("docs/*.md")])(
    "%s does not write it into a script",
    (file) => {
      const fences = yamlFences(readFileSync(join(root, file), "utf8"));
      expect(
        fences
          .filter((fence) => fence.includes("structured_output"))
          .flatMap(unsafeScripts),
      ).toEqual([]);
    },
  );
});
