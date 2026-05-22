import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { prepareTagMode } from "../../src/modes/tag";
import { mockIssueCommentContext } from "../mockContext";
import * as actorValidation from "../../src/github/validation/actor";
import * as comments from "../../src/github/operations/comments/create-initial";
import * as dataFetcher from "../../src/github/data/fetcher";
import * as branchOps from "../../src/github/operations/branch";
import * as gitConfig from "../../src/github/operations/git-config";
import * as prompt from "../../src/create-prompt";
import * as mcp from "../../src/mcp/install-mcp-server";

describe("Tag Mode", () => {
  let spies: { mockRestore: () => void }[] = [];

  beforeEach(() => {
    delete process.env.CLAUDE_ARGS;
  });

  afterEach(() => {
    for (const spy of spies) {
      spy.mockRestore();
    }
    spies = [];
    delete process.env.CLAUDE_ARGS;
  });

  test("prepareTagMode is exported as a function", () => {
    expect(typeof prepareTagMode).toBe("function");
  });

  test("configures git auth before branch setup fetches from origin", async () => {
    const calls: string[] = [];

    spies.push(
      spyOn(actorValidation, "checkHumanActor").mockImplementation(
        async () => {},
      ),
      spyOn(comments, "createInitialComment").mockImplementation(
        async () => ({ id: 123 }) as any,
      ),
      spyOn(dataFetcher, "fetchGitHubData").mockImplementation(async () => ({
        contextData: {
          title: "Issue title",
          body: "",
          labels: { nodes: [] },
        } as any,
        comments: [],
        changedFiles: [],
        changedFilesWithSHA: [],
        reviewData: null,
        imageUrlMap: new Map(),
      })),
      spyOn(gitConfig, "configureGitAuth").mockImplementation(async () => {
        calls.push("auth");
      }),
      spyOn(branchOps, "setupBranch").mockImplementation(async () => {
        calls.push("branch");
        return {
          baseBranch: "main",
          claudeBranch: "claude/issue-1",
          currentBranch: "claude/issue-1",
        };
      }),
      spyOn(prompt, "createPrompt").mockImplementation(async () => {}),
      spyOn(mcp, "prepareMcpConfig").mockImplementation(async () =>
        JSON.stringify({ mcpServers: {} }),
      ),
    );

    await prepareTagMode({
      context: mockIssueCommentContext,
      octokit: {} as any,
      githubToken: "test-token",
    });

    expect(calls).toEqual(["auth", "branch"]);
  });
});
