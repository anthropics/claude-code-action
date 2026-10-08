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

    beforeEach(() => {
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
        spyOn(mcp, "prepareMcpConfig").mockImplementation(async () => "{}"),
      ];
    });

    afterEach(() => {
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
      // TRI fork: the checkout credential is replaced once up front, before
      // setupBranch fetches; configureGitAuth (mocked here) repeats it.
      expect(replaceCheckoutCredentialsSpy).toHaveBeenCalledTimes(1);
    });

    test("replaces the checkout credential before setupBranch fetches", async () => {
      const order: string[] = [];
      replaceCheckoutCredentialsSpy.mockImplementation(async () => {
        order.push("credentials");
      });
      const setupSpy = spyOn(branch, "setupBranch").mockImplementation(
        async () => {
          order.push("setupBranch");
          return {
            baseBranch: "main",
            claudeBranch: undefined,
            currentBranch: "main",
          } as any;
        },
      );
      spies.push(setupSpy);

      await prepareTagMode({
        context: { ...mockIssueCommentContext },
        octokit: {} as any,
        githubToken: "test-token",
      });

      expect(order.slice(0, 2)).toEqual(["credentials", "setupBranch"]);
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
      // Once before setupBranch, once on the API-signing path.
      expect(replaceCheckoutCredentialsSpy).toHaveBeenCalledTimes(2);
      expect(replaceCheckoutCredentialsSpy).toHaveBeenCalledWith(
        "test-token",
        context,
      );
    });
  });
});
