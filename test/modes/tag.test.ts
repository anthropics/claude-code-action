import { describe, test, expect } from "bun:test";
import { buildTagModeTools, prepareTagMode } from "../../src/modes/tag";

describe("Tag Mode", () => {
  test("prepareTagMode is exported as a function", () => {
    expect(typeof prepareTagMode).toBe("function");
  });

  test("buildTagModeTools includes git write tools by default", () => {
    const tools = buildTagModeTools({
      userAllowedMCPTools: [],
      gitPushWrapper: "/action/scripts/git-push.sh",
      useApiCommitSigning: false,
      readOnly: false,
    });

    expect(tools).toContain("Bash(git add:*)");
    expect(tools).toContain("Bash(git commit:*)");
    expect(tools).toContain("Bash(/action/scripts/git-push.sh:*)");
    expect(tools).toContain("Bash(git rm:*)");
  });

  test("buildTagModeTools includes GitHub file write tools for API commit signing", () => {
    const tools = buildTagModeTools({
      userAllowedMCPTools: [],
      gitPushWrapper: "/action/scripts/git-push.sh",
      useApiCommitSigning: true,
      readOnly: false,
    });

    expect(tools).toContain("mcp__github_file_ops__commit_files");
    expect(tools).toContain("mcp__github_file_ops__delete_files");
    expect(tools).not.toContain("Bash(git commit:*)");
  });

  test("buildTagModeTools omits commit and delete tools in read-only mode", () => {
    const tools = buildTagModeTools({
      userAllowedMCPTools: [
        "mcp__github_inline_comment__create_inline_comment",
      ],
      gitPushWrapper: "/action/scripts/git-push.sh",
      useApiCommitSigning: true,
      readOnly: true,
    });

    expect(tools).toContain("Read");
    expect(tools).toContain("mcp__github_ci__get_ci_status");
    expect(tools).toContain(
      "mcp__github_inline_comment__create_inline_comment",
    );
    expect(tools).not.toContain("Bash(git add:*)");
    expect(tools).not.toContain("Bash(git commit:*)");
    expect(tools).not.toContain("Bash(/action/scripts/git-push.sh:*)");
    expect(tools).not.toContain("Bash(git rm:*)");
    expect(tools).not.toContain("mcp__github_file_ops__commit_files");
    expect(tools).not.toContain("mcp__github_file_ops__delete_files");
  });
});
