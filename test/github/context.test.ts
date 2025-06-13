import { describe, it, expect } from "bun:test";
import { parseMultilineInput } from "../../src/github/context";

describe("parseMultilineInput", () => {
  it("should parse a comma-separated string", () => {
    const input = `Bash(bun install),Bash(bun test:*),Bash(bun typecheck)`;
    const result = parseMultilineInput(input);
    expect(result).toEqual([
      "Bash(bun install)",
      "Bash(bun test:*)",
      "Bash(bun typecheck)",
    ]);
  });

  it("should parse multiline string", () => {
    const input = `Bash(bun install)
Bash(bun test:*)
Bash(bun typecheck)`;
    const result = parseMultilineInput(input);
    expect(result).toEqual([
      "Bash(bun install)",
      "Bash(bun test:*)",
      "Bash(bun typecheck)",
    ]);
  });

  it("should parse comma-separated multiline line", () => {
    const input = `Bash(bun install),Bash(bun test:*)
Bash(bun typecheck)`;
    const result = parseMultilineInput(input);
    expect(result).toEqual([
      "Bash(bun install)",
      "Bash(bun test:*)",
      "Bash(bun typecheck)",
    ]);
  });

  it("should ignore comments", () => {
    const input = `Bash(bun install),
Bash(bun test:*) # For testing
# For type checking
Bash(bun typecheck)
`;
    const result = parseMultilineInput(input);
    expect(result).toEqual([
      "Bash(bun install)",
      "Bash(bun test:*)",
      "Bash(bun typecheck)",
    ]);
  });

  it("should parse an empty string", () => {
    const input = "";
    const result = parseMultilineInput(input);
    expect(result).toEqual([]);
  });
});
