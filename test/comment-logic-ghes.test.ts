import { describe, it, expect } from "bun:test";
import { resolve } from "path";

/**
 * updateCommentBody derives the branch tree URL from the job URL when no
 * branchLink was provided. That extraction must follow GITHUB_SERVER_URL so
 * GitHub Enterprise Server installs get a working link instead of a bare
 * branch name.
 *
 * GITHUB_SERVER_URL is read once at module load, so this scenario runs in a
 * subprocess to stay independent of whatever env the rest of the suite
 * imported the module with.
 */
describe("updateCommentBody branch link on GitHub Enterprise Server", () => {
  it("builds the branch link from the enterprise server URL", async () => {
    const script = `
      const { updateCommentBody } = await import("./src/github/operations/comment-logic");
      const result = updateCommentBody({
        currentBody: "Claude Code is working…",
        actionFailed: false,
        executionDetails: null,
        jobUrl: "https://ghe.corp.example.com/owner/repo/actions/runs/42",
        branchName: "claude/issue-7",
        triggerUsername: "someone",
      });
      process.stdout.write(result.split("\\n")[0]);
    `;

    const proc = Bun.spawn(["bun", "-e", script], {
      cwd: resolve(import.meta.dir, ".."),
      env: {
        ...process.env,
        GITHUB_SERVER_URL: "https://ghe.corp.example.com",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stdout).toContain(
      "[`claude/issue-7`](https://ghe.corp.example.com/owner/repo/tree/claude/issue-7)",
    );
  });
});
