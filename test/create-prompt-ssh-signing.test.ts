import { test, expect, spyOn } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrompt } from "../src/create-prompt";
import { mockIssueOpenedContext } from "./mockContext";

test("SSH signing prompt gives git instructions when API signing is also enabled", async () => {
  const temp = mkdtempSync(join(tmpdir(), "claude-prompt-ssh-"));
  const previousTemp = process.env.RUNNER_TEMP;
  const logSpy = spyOn(console, "log").mockImplementation(() => {});
  process.env.RUNNER_TEMP = temp;

  try {
    const context = {
      ...mockIssueOpenedContext,
      inputs: {
        ...mockIssueOpenedContext.inputs,
        useCommitSigning: true,
        sshSigningKey: "test-key",
      },
    };
    const data = {
      contextData: {
        title: "Fix the bug",
        body: "Please fix the bug",
        author: { login: "author" },
        state: "OPEN",
        labels: { nodes: [] },
      },
      comments: [],
      changedFiles: [],
      changedFilesWithSHA: [],
      reviewData: null,
      imageUrlMap: new Map(),
    } as any;

    await createPrompt(5, "main", "claude/issue-42", data, context);
    const prompt = readFileSync(
      join(temp, "claude-prompts/claude-prompt.txt"),
      "utf8",
    );
    expect(prompt).toContain("Use git commands via the Bash tool");
    expect(prompt).not.toContain("mcp__github_file_ops__commit_files");
  } finally {
    logSpy.mockRestore();
    if (previousTemp === undefined) delete process.env.RUNNER_TEMP;
    else process.env.RUNNER_TEMP = previousTemp;
    rmSync(temp, { recursive: true, force: true });
  }
});
