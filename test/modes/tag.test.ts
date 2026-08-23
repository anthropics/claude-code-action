import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import type { Mock } from "bun:test";
import { prepareTagMode } from "../../src/modes/tag";
import { mockIssueCommentContext } from "../mockContext";
import * as actorValidation from "../../src/github/validation/actor";
import * as createInitialComment from "../../src/github/operations/comments/create-initial";
import * as fetcher from "../../src/github/data/fetcher";
import * as branchOps from "../../src/github/operations/branch";
import * as gitConfig from "../../src/github/operations/git-config";
import * as createPromptModule from "../../src/create-prompt";

describe("Tag Mode", () => {
  test("prepareTagMode is exported as a function", () => {
    expect(typeof prepareTagMode).toBe("function");
  });

  describe("git auth ordering", () => {
    const callOrder: string[] = [];
    const restores: Mock<any>[] = [];

    beforeEach(() => {
      callOrder.length = 0;
      delete process.env.CLAUDE_ARGS;

      restores.push(
        spyOn(actorValidation, "checkHumanActor").mockImplementation(
          async () => {},
        ) as unknown as Mock<any>,
      );
      restores.push(
        spyOn(createInitialComment, "createInitialComment").mockImplementation(
          async () => ({ id: 42 }) as any,
        ) as unknown as Mock<any>,
      );
      restores.push(
        spyOn(fetcher, "fetchGitHubData").mockImplementation(async () => ({
          contextData: {
            title: "Test issue",
            body: "",
            labels: { nodes: [] },
          } as any,
          comments: [],
          changedFiles: [],
          changedFilesWithSHA: [],
          reviewData: null,
          imageUrlMap: new Map(),
        })) as unknown as Mock<any>,
      );
      restores.push(
        spyOn(gitConfig, "configureGitAuth").mockImplementation(async () => {
          callOrder.push("configureGitAuth");
        }) as unknown as Mock<any>,
      );
      restores.push(
        spyOn(branchOps, "setupBranch").mockImplementation(async () => {
          callOrder.push("setupBranch");
          return {
            baseBranch: "main",
            claudeBranch: "claude/issue-1",
            currentBranch: "claude/issue-1",
          };
        }) as unknown as Mock<any>,
      );
      restores.push(
        spyOn(createPromptModule, "createPrompt").mockImplementation(
          async () => {},
        ) as unknown as Mock<any>,
      );
    });

    afterEach(() => {
      for (const restore of restores) {
        restore.mockRestore();
      }
      restores.length = 0;
      delete process.env.CLAUDE_ARGS;
    });

    test("configures git authentication before setupBranch performs its fetch", async () => {
      await prepareTagMode({
        context: mockIssueCommentContext,
        octokit: {} as any,
        githubToken: "test-token",
      });

      expect(callOrder).toEqual(["configureGitAuth", "setupBranch"]);
    });
  });
});
