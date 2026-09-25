import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { INPUT_DEFAULTS } from "../src/entrypoints/collect-inputs";

const metadata = readFileSync(
  new URL("../action.yml", import.meta.url),
  "utf8",
);

/**
 * Extract the declared inputs and their defaults from action.yml.
 *
 * Parsed with regexes rather than a YAML library: the repo has no YAML
 * dependency, the existing assertion below already matches against the raw
 * text, and CI pins a Bun version that predates Bun.YAML.
 *
 * An input is a two-space-indented key inside the `inputs:` block; its default
 * is the first four-space-indented `default:` that follows. Description bodies
 * are indented deeper, so they cannot be mistaken for either.
 */
function parseDeclaredInputs(actionYml: string): Record<string, string> {
  const start = actionYml.indexOf("\ninputs:");
  const end = actionYml.indexOf("\noutputs:");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Could not locate the inputs block in action.yml");
  }

  const declared: Record<string, string> = {};
  let current: string | null = null;

  for (const line of actionYml.slice(start, end).split("\n")) {
    const nameMatch = line.match(/^ {2}([a-z_][a-z0-9_]*):\s*$/);
    if (nameMatch?.[1]) {
      current = nameMatch[1];
      // Inputs with no `default:` are unset-by-default, which GitHub Actions
      // renders as an empty string in toJson(inputs).
      declared[current] = "";
      continue;
    }

    const defaultMatch = line.match(/^ {4}default:\s*(.*)$/);
    if (
      defaultMatch?.[1] !== undefined &&
      current &&
      declared[current] === ""
    ) {
      declared[current] = parseScalar(defaultMatch[1]);
    }
  }

  return declared;
}

/** Unquote a YAML scalar, stripping a trailing comment from unquoted values. */
function parseScalar(raw: string): string {
  const value = raw.trim();
  if (value.startsWith('"')) {
    return value.slice(1, value.lastIndexOf('"'));
  }
  if (value.startsWith("'")) {
    return value.slice(1, value.lastIndexOf("'"));
  }
  return value.split("#")[0]!.trim();
}

describe("action metadata", () => {
  test("should expose the conclusion output from the run step", () => {
    expect(metadata).toMatch(
      /^  conclusion:\n    description: .+\n    value: \$\{\{ steps\.run\.outputs\.conclusion \}\}$/m,
    );
  });
});

describe("action input drift", () => {
  const declared = parseDeclaredInputs(metadata);

  test("parses a plausible number of inputs from action.yml", () => {
    // Guards the parser itself: a regex that silently stops matching would
    // otherwise make every assertion below vacuously pass.
    expect(Object.keys(declared).length).toBeGreaterThan(30);
    expect(declared.prompt).toBe("");
    expect(declared.trigger_phrase).toBe("@claude");
    expect(declared.bot_id).toBe("41898282");
  });

  test("INPUT_DEFAULTS tracks every input declared in action.yml", () => {
    const missing = Object.keys(declared).filter((n) => !(n in INPUT_DEFAULTS));
    expect(missing).toEqual([]);
  });

  test("INPUT_DEFAULTS contains no inputs action.yml no longer declares", () => {
    const stale = Object.keys(INPUT_DEFAULTS).filter((n) => !(n in declared));
    expect(stale).toEqual([]);
  });

  test("INPUT_DEFAULTS values match the defaults declared in action.yml", () => {
    // A drifted default silently inverts the presence signal for that input,
    // so the values are asserted alongside the key set.
    expect(INPUT_DEFAULTS).toEqual(declared);
  });

  test("every inputs.* expression in action.yml refers to a declared input", () => {
    const referenced = new Set(
      [...metadata.matchAll(/inputs\.([a-z_][a-z0-9_]*)/g)].map((m) => m[1]!),
    );
    const undeclared = [...referenced].filter((n) => !(n in declared)).sort();
    expect(undeclared).toEqual([]);
  });
});
