import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { prepareTagMode } from "../../src/modes/tag";
import { mockIssueCommentContext } from "../mockContext";
import * as actor from "../../src/github/validation/actor";
import * as createInitial from "../../src/github/operations/comments/create-initial";
import * as fetcher from "../../src/github/data/fetcher";
import * as branch from "../../src/github/operations/branch";
import * as createPrompt from "../../src/create-prompt";
import * as mcp from "../../src/mcp/install-mcp-server";
import * as gitConfig from "../../src/github/operations/git-config";

describe("Tag Mode", () => {
  test("prepareTagMode is exported as a function", () => {
    expect(typeof prepareTagMode).toBe("function");
  });

  describe("git credential configuration", () => {
    let spies: Array<{ mockRestore: () => void }>;
    let configureGitAuthSpy: any;
    let replaceCheckoutCredentialsSpy: any;
    let prepareMcpConfigSpy: any;
    let originalClaudeArgs: string | undefined;

    beforeEach(() => {
      originalClaudeArgs = process.env.CLAUDE_ARGS;
      configureGitAuthSpy = spyOn(
        gitConfig,
        "configureGitAuth",
      ).mockImplementation(async () => {});
      replaceCheckoutCredentialsSpy = spyOn(
        gitConfig,
        "replaceCheckoutCredentials",
      ).mockImplementation(async () => {});
      spies = [
        configureGitAuthSpy,
        replaceCheckoutCredentialsSpy,
        spyOn(actor, "checkHumanActor").mockImplementation(async () => {}),
        spyOn(createInitial, "createInitialComment").mockImplementation(
          async () => ({ id: 42 }) as any,
        ),
        spyOn(fetcher, "fetchGitHubData").mockImplementation(
          async () => ({}) as any,
        ),
        spyOn(branch, "setupBranch").mockImplementation(
          async () =>
            ({
              baseBranch: "main",
              claudeBranch: "claude/test",
              currentBranch: "claude/test",
            }) as any,
        ),
        spyOn(createPrompt, "createPrompt").mockImplementation(async () => {}),
        (prepareMcpConfigSpy = spyOn(
          mcp,
          "prepareMcpConfig",
        ).mockImplementation(async () => "{}")),
      ];
    });

    afterEach(() => {
      if (originalClaudeArgs === undefined) {
        delete process.env.CLAUDE_ARGS;
      } else {
        process.env.CLAUDE_ARGS = originalClaudeArgs;
      }
      for (const spy of spies) {
        spy.mockRestore();
      }
    });

    test("uses full git auth on the non-signing path", async () => {
      const context = { ...mockIssueCommentContext };

      await prepareTagMode({
        context,
        octokit: {} as any,
        githubToken: "test-token",
      });

      expect(configureGitAuthSpy).toHaveBeenCalledTimes(1);
      expect(configureGitAuthSpy).toHaveBeenCalledWith("test-token", context, {
        login: context.inputs.botName,
        id: parseInt(context.inputs.botId),
      });
      // configureGitAuth performs the credential replacement itself; the mock
      // stands in for it here, so the standalone helper is not invoked.
      expect(replaceCheckoutCredentialsSpy).not.toHaveBeenCalled();
    });

    test("still replaces the checkout credential when API commit signing is enabled", async () => {
      const context = {
        ...mockIssueCommentContext,
        inputs: { ...mockIssueCommentContext.inputs, useCommitSigning: true },
      };

      await prepareTagMode({
        context,
        octokit: {} as any,
        githubToken: "test-token",
      });

      expect(configureGitAuthSpy).not.toHaveBeenCalled();
      expect(replaceCheckoutCredentialsSpy).toHaveBeenCalledTimes(1);
      expect(replaceCheckoutCredentialsSpy).toHaveBeenCalledWith(
        "test-token",
        context,
      );
    });

    test("forwards the mcp__github aggregate selector to MCP setup", async () => {
      process.env.CLAUDE_ARGS = "--allowedTools mcp__github";

      await prepareTagMode({
        context: { ...mockIssueCommentContext },
        octokit: {} as any,
        githubToken: "test-token",
      });

      expect(prepareMcpConfigSpy).toHaveBeenCalledTimes(1);
      expect(prepareMcpConfigSpy.mock.calls[0]?.[0].allowedTools).toContain(
        "mcp__github",
      );
    });
  });
});
