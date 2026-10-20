import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const actionMetadata = readFileSync(
  new URL("../action.yml", import.meta.url),
  "utf8",
);
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

describe("base action README", () => {
  test("should document every input declared in the action metadata", () => {
    const inputMetadata = actionMetadata.match(
      /^inputs:\n([\s\S]*?)^outputs:/m,
    )?.[1];
    const inputReference = readme.match(
      /^## Inputs\n([\s\S]*?)^## Outputs/m,
    )?.[1];

    expect(inputMetadata).toBeDefined();
    expect(inputReference).toBeDefined();

    const declaredInputs = [
      ...(inputMetadata?.matchAll(/^  ([a-z0-9_]+):$/gm) ?? []),
    ].map((match) => match[1]);
    const documentedInputs = [
      ...(inputReference?.matchAll(/^\| `([^`]+)`/gm) ?? []),
    ].map((match) => match[1]);

    expect(documentedInputs).toEqual(declaredInputs);
  });

  test("should not use removed legacy inputs in workflow examples", () => {
    const removedInputs = [
      "allowed_tools",
      "disallowed_tools",
      "max_turns",
      "mcp_config",
      "system_prompt",
      "append_system_prompt",
      "claude_env",
      "model",
      "anthropic_model",
      "fallback_model",
    ];

    for (const input of removedInputs) {
      expect(readme).not.toMatch(new RegExp(`^\\s+${input}:`, "m"));
    }
  });
});
