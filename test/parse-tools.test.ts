/**
 * Regression tests for `Bash(...)` deny patterns whose content contains
 * parentheses: the extraction used to stop at the first `)` instead of the
 * last unescaped one, silently defeating such rules.
 */
import { describe, test, expect } from "bun:test";
import {
  parseDeniedBashPatterns,
  wrapperDenyRules,
} from "../src/modes/agent/parse-tools";

describe("parseDeniedBashPatterns — paren-containing rules", () => {
  test("a commit-message rule with '(' keeps its full content and ':*' qualifier", () => {
    const args = `--disallowedTools 'Bash(git commit -m "fix(auth): reject empty token":*)'`;
    expect(parseDeniedBashPatterns(args)).toEqual([
      'git commit -m "fix(auth): reject empty token":*',
    ]);
  });

  test("escaped parens inside the pattern are unescaped, not treated as boundaries", () => {
    const args = `--disallowedTools 'Bash(git commit -m "note \\(draft\\)":*)'`;
    expect(parseDeniedBashPatterns(args)).toEqual([
      'git commit -m "note (draft)":*',
    ]);
  });

  test("two Bash(...) rules in one value each keep their own parens separate", () => {
    const args = `--disallowedTools 'Bash(git commit -m "a(b)":*),Bash(git push origin main:*)'`;
    expect(parseDeniedBashPatterns(args)).toEqual([
      'git commit -m "a(b)":*',
      "git push origin main:*",
    ]);
  });

  test("control: canonical form without parens is unaffected", () => {
    const args = `--disallowedTools 'Bash(git push:*)'`;
    expect(parseDeniedBashPatterns(args)).toEqual(["git push:*"]);
  });

  test("end-to-end: the generated wrapper rule now carries the full message and ':*'", () => {
    const args = `--disallowedTools 'Bash(git commit -m "fix(auth): reject empty token":*)'`;
    const denied = parseDeniedBashPatterns(args);
    const wrapper = "/path/to/scripts/git-commit.sh";
    const rules = wrapperDenyRules(denied, "git commit", wrapper);
    expect(rules).toEqual([
      `Bash(${wrapper} -m "fix(auth): reject empty token":*)`,
    ]);
  });
});
