import { parseDeniedBashPatterns } from "../../src/modes/agent/parse-tools";
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
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as sessionGuard from "../../src/github/operations/session-guard";

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
      // configureGitAuth performs the credential replacement itself; the mock
      // stands in for it here, so the standalone helper is not invoked.
      expect(replaceCheckoutCredentialsSpy).not.toHaveBeenCalled();
    });

    describe("push branch", () => {
      const savedPath = process.env.GITHUB_ACTION_PATH;
      let actionPath: string;

      const pinned = () =>
        readFileSync(join(actionPath, "scripts/.push-branch"), "utf8");

      beforeEach(() => {
        actionPath = mkdtempSync(join(tmpdir(), "tag-action-"));
        process.env.GITHUB_ACTION_PATH = actionPath;
      });

      afterEach(() => {
        rmSync(actionPath, { recursive: true, force: true });
        if (savedPath === undefined) delete process.env.GITHUB_ACTION_PATH;
        else process.env.GITHUB_ACTION_PATH = savedPath;
      });

      test("pins the push wrapper to a new claude branch", async () => {
        await prepareTagMode({
          context: { ...mockIssueCommentContext },
          octokit: {} as any,
          githubToken: "test-token",
        });
        expect(pinned()).toBe("claude/test");
        expect(process.env.CLAUDE_PUSH_BRANCH).toBeUndefined();
      });

      test("pins the push wrapper to the branch of an open PR", async () => {
        spies.push(
          spyOn(branch, "setupBranch").mockImplementation(
            async () =>
              ({ baseBranch: "main", currentBranch: "feature" }) as any,
          ),
        );
        await prepareTagMode({
          context: { ...mockIssueCommentContext },
          octokit: {} as any,
          githubToken: "test-token",
        });
        expect(pinned()).toBe("feature");
      });
    });

    describe("a workflow's deny rules", () => {
      const savedArgs = process.env.CLAUDE_ARGS;
      const savedPath = process.env.GITHUB_ACTION_PATH;

      beforeEach(() => {
        process.env.GITHUB_ACTION_PATH = "/action";
        spies.push(
          spyOn(sessionGuard, "pinPushBranch").mockImplementation(() => {}),
        );
      });

      afterEach(() => {
        if (savedArgs === undefined) delete process.env.CLAUDE_ARGS;
        else process.env.CLAUDE_ARGS = savedArgs;
        if (savedPath === undefined) delete process.env.GITHUB_ACTION_PATH;
        else process.env.GITHUB_ACTION_PATH = savedPath;
      });

      const prepare = async (userArgs: string) => {
        process.env.CLAUDE_ARGS = userArgs;
        const { claudeArgs } = await prepareTagMode({
          context: { ...mockIssueCommentContext },
          octokit: {} as any,
          githubToken: "test-token",
        });
        return claudeArgs;
      };

      test.each([
        ["git add", "git-add.sh"],
        ["git rm", "git-rm.sh"],
      ])("a deny of %s also denies its wrapper", async (command, wrapper) => {
        expect(
          await prepare(`--disallowedTools "Bash(${command}:*)"`),
        ).toContain(`--disallowedTools 'Bash(/action/scripts/${wrapper}:*)'`);
      });

      test("a deny of git commit also denies the commit wrapper", async () => {
        expect(
          await prepare(`--disallowedTools "Bash(git commit:*)"`),
        ).toContain(
          `--disallowedTools 'Bash(/action/scripts/git-commit.sh:*)'`,
        );
      });

      test.each([
        `--disallowedTools Bash(git:*)`,
        `--disallowedTools="Bash(git commit:*)"`,
        `--disallowedTools "Bash(git comm*)"`,
      ])("carries over %s", async (args) => {
        expect(await prepare(args)).toContain(
          `--disallowedTools 'Bash(/action/scripts/git-commit.sh:*)`,
        );
      });

      test("a deny of git push also denies the push wrapper", async () => {
        expect(await prepare(`--disallowedTools "Bash(git push:*)"`)).toContain(
          `--disallowedTools 'Bash(/action/scripts/git-push.sh:*)'`,
        );
      });

      test("adds no deny rule of its own otherwise", async () => {
        const args = await prepare(`--disallowedTools "Bash(git add -A:*)"`);
        expect(args).toContain(
          `--disallowedTools 'Bash(/action/scripts/git-add.sh -A:*)'`,
        );
        for (const rest of [`"a b"`, "it's", "$HOME/x"]) {
          const denied = await prepare(
            `--disallowedTools 'Bash(git add ${rest.replace(/'/g, "'\\''")}:*)'`,
          );
          expect(parseDeniedBashPatterns(denied)).toContain(
            `/action/scripts/git-add.sh ${rest}:*`,
          );
        }
        expect(await prepare(`--disallowedTools "WebFetch"`)).not.toContain(
          `--disallowedTools 'Bash(`,
        );
        expect(await prepare("")).not.toContain("--disallowedTools");
      });
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
  });
});
