import { describe, it, expect } from "bun:test";
import {
  parseMultilineInput,
  parseAdditionalPermissions,
} from "../../src/github/context";

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

describe("parseAdditionalPermissions", () => {
  it("should parse single permission", () => {
    const input = "actions: read";
    const result = parseAdditionalPermissions(input);
    expect(result.get("actions")).toBe("read");
    expect(result.size).toBe(1);
  });

  it("should parse multiple permissions", () => {
    const input = `actions: read
packages: write
contents: read`;
    const result = parseAdditionalPermissions(input);
    expect(result.get("actions")).toBe("read");
    expect(result.get("packages")).toBe("write");
    expect(result.get("contents")).toBe("read");
    expect(result.size).toBe(3);
  });

  it("should handle empty string", () => {
    const input = "";
    const result = parseAdditionalPermissions(input);
    expect(result.size).toBe(0);
  });

  it("should handle whitespace and empty lines", () => {
    const input = `
    actions: read

    packages: write
    `;
    const result = parseAdditionalPermissions(input);
    expect(result.get("actions")).toBe("read");
    expect(result.get("packages")).toBe("write");
    expect(result.size).toBe(2);
  });

  it("should ignore lines without colon separator", () => {
    const input = `actions: read
invalid line
packages: write`;
    const result = parseAdditionalPermissions(input);
    expect(result.get("actions")).toBe("read");
    expect(result.get("packages")).toBe("write");
    expect(result.size).toBe(2);
  });

  it("should trim whitespace around keys and values", () => {
    const input = "  actions  :  read  ";
    const result = parseAdditionalPermissions(input);
    expect(result.get("actions")).toBe("read");
    expect(result.size).toBe(1);
  });
});
