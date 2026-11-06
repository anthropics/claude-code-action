import { describe, expect, test } from "bun:test";
import { scopePullRequestReviewPrompt } from "../../src/modes/agent";

describe("scopePullRequestReviewPrompt", () => {
  test("limits built-in review commands to the pull request files", () => {
    const prompt = scopePullRequestReviewPrompt("/code-review medium 37", [
      "tools/command-center/index.ts",
      "CHANGELOG.md",
      "tools/command-center/index.ts",
    ]);

    expect(prompt).toContain("- CHANGELOG.md");
    expect(prompt).toContain("- tools/command-center/index.ts");
    expect(prompt).toContain(
      "do not report findings for files outside this list",
    );
  });

  test("does not change non-review prompts", () => {
    const prompt = "Fix the failing test in src/index.ts";

    expect(scopePullRequestReviewPrompt(prompt, ["src/index.ts"])).toBe(prompt);
  });
});
