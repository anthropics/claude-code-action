import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { prepareTagMode } from "../../src/modes/tag";
import { mockPullRequestCommentContext } from "../mockContext";
import * as actor from "../../src/github/validation/actor";
import * as createInitial from "../../src/github/operations/comments/create-initial";
import * as fetcher from "../../src/github/data/fetcher";
import * as branch from "../../src/github/operations/branch";
import * as createPrompt from "../../src/create-prompt";
import * as gitConfig from "../../src/github/operations/git-config";
import type { ParsedGitHubContext } from "../../src/github/context";

/**
 * The GitHub MCP servers are only started when the allowed-tools parser reports
 * a matching tool, so a server-level rule written as the bare server name
 * (`mcp__github`, `mcp__github_inline_comment`, ...) has to survive the same
 * way a `mcp__github__<tool>` rule does. Otherwise Claude is granted a tool
 * whose server was never installed.
 *
 * install-mcp-server.ts accepts the bare names (see the "shorthand" tests in
 * test/install-mcp-server.test.ts), and agent mode feeds it the parser output
 * unfiltered, so tag mode has to agree with both.
 */
describe("Tag Mode > MCP servers for server-level allowed tools", () => {
  let spies: Array<{ mockRestore: () => void }> = [];
  let originalClaudeArgs: string | undefined;
  let originalActionPath: string | undefined;
  let originalWorkflowToken: string | undefined;

  beforeEach(() => {
    originalClaudeArgs = process.env.CLAUDE_ARGS;
    originalActionPath = process.env.GITHUB_ACTION_PATH;
    originalWorkflowToken = process.env.DEFAULT_WORKFLOW_TOKEN;
    process.env.GITHUB_ACTION_PATH = "/test/action/path";
    delete process.env.DEFAULT_WORKFLOW_TOKEN;

    spies = [
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
      spyOn(gitConfig, "configureGitAuth").mockImplementation(async () => {}),
      spyOn(gitConfig, "replaceCheckoutCredentials").mockImplementation(
        async () => {},
      ),
    ];
  });

  afterEach(() => {
    for (const spy of spies) spy.mockRestore();
    spies = [];
    restore("CLAUDE_ARGS", originalClaudeArgs);
    restore("GITHUB_ACTION_PATH", originalActionPath);
    restore("DEFAULT_WORKFLOW_TOKEN", originalWorkflowToken);
  });

  function restore(name: string, value: string | undefined): void {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  async function prepare(
    claudeArgs: string,
    context: ParsedGitHubContext = mockPullRequestCommentContext,
  ) {
    process.env.CLAUDE_ARGS = claudeArgs;
    const result = await prepareTagMode({
      context,
      octokit: {} as any,
      githubToken: "test-token",
    });
    return { result, config: JSON.parse(result.mcpConfig) };
  }

  test("installs the inline comment server for a bare mcp__github_inline_comment rule", async () => {
    const { config } = await prepare(
      "--allowedTools mcp__github_inline_comment",
    );

    expect(config.mcpServers.github_inline_comment).toBeDefined();
    expect(config.mcpServers.github_inline_comment.env.PR_NUMBER).toBe(
      String(mockPullRequestCommentContext.entityNumber),
    );
  });

  test("installs the github MCP server for a bare mcp__github rule", async () => {
    const { result, config } = await prepare("--allowedTools mcp__github");

    // The rule reaches the SDK either way: the user's claude_args are appended
    // to the action's own list verbatim, so Claude is granted the server's
    // tools. The server itself has to be in the MCP config for those tools to
    // exist, which is what the install decision reads this list for.
    expect(result.claudeArgs).toContain("mcp__github");
    expect(config.mcpServers.github).toBeDefined();
    expect(config.mcpServers.github.command).toBe("docker");
  });

  test("still installs the github MCP server for a qualified mcp__github__<tool> rule", async () => {
    const { config } = await prepare(
      '--allowedTools "mcp__github__get_commit,mcp__github_inline_comment__create_inline_comment"',
    );

    expect(config.mcpServers.github).toBeDefined();
    expect(config.mcpServers.github_inline_comment).toBeDefined();
  });
});
