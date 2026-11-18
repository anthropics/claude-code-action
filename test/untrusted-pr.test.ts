import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as core from "@actions/core";
import { parseSdkOptions } from "../base-action/src/parse-sdk-options";
import type { ParsedGitHubContext } from "../src/github/context";
import {
  getUntrustedPrDisallowedTools,
  UNTRUSTED_PR_DISALLOWED_TOOLS,
} from "../src/github/validation/untrusted-pr";
import {
  mockIssueCommentContext,
  mockPullRequestCommentContext,
  mockPullRequestOpenedContext,
  mockPullRequestReviewCommentContext,
  mockPullRequestReviewContext,
} from "./mockContext";

function octokitWithPermission(permission: string) {
  const calls: string[] = [];
  const octokit = {
    repos: {
      getCollaboratorPermissionLevel: async ({
        username,
      }: {
        username: string;
      }) => {
        calls.push(username);
        return { data: { permission } };
      },
    },
  } as any;
  return { octokit, calls };
}

function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

function withPrAuthor(
  context: ParsedGitHubContext,
  login: string,
): ParsedGitHubContext {
  const payload = context.payload as any;
  const key = "pull_request" in payload ? "pull_request" : "issue";
  return {
    ...context,
    payload: {
      ...payload,
      [key]: { ...payload[key], user: { ...payload[key].user, login } },
    },
  };
}

describe("getUntrustedPrDisallowedTools", () => {
  let warningSpy: any;
  let logSpy: any;
  let errorSpy: any;
  const savedSetting = process.env.RESTRICT_UNTRUSTED_PRS;
  const savedArgs = process.env.CLAUDE_ARGS;

  const warnings = (): string[] =>
    warningSpy.mock.calls.map((call: any[]) => call[0]);
  const uncoveredWarning = () =>
    warnings().find((w) => w.includes("Bash rule(s)"));

  beforeEach(() => {
    warningSpy = spyOn(core, "warning").mockImplementation(() => {});
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
    delete process.env.RESTRICT_UNTRUSTED_PRS;
    delete process.env.CLAUDE_ARGS;
  });

  afterEach(() => {
    warningSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    if (savedSetting === undefined) delete process.env.RESTRICT_UNTRUSTED_PRS;
    else process.env.RESTRICT_UNTRUSTED_PRS = savedSetting;
    if (savedArgs === undefined) delete process.env.CLAUDE_ARGS;
    else process.env.CLAUDE_ARGS = savedArgs;
  });

  test("does not restrict issues or look anything up for them", async () => {
    const { octokit, calls } = octokitWithPermission("read");
    expect(
      await getUntrustedPrDisallowedTools(octokit, mockIssueCommentContext),
    ).toEqual([]);
    expect(calls).toEqual([]);
  });

  test.each(["admin", "write"])(
    "does not restrict a PR whose author has %s access",
    async (permission) => {
      const { octokit } = octokitWithPermission(permission);
      expect(
        await getUntrustedPrDisallowedTools(
          octokit,
          mockPullRequestOpenedContext,
        ),
      ).toEqual([]);
    },
  );

  test.each(["read", "triage", "none"])(
    "restricts a PR whose author has %s access",
    async (permission) => {
      const { octokit } = octokitWithPermission(permission);
      expect(
        await getUntrustedPrDisallowedTools(
          octokit,
          mockPullRequestOpenedContext,
        ),
      ).toEqual(UNTRUSTED_PR_DISALLOWED_TOOLS);
    },
  );

  test.each([
    [mockPullRequestCommentContext, "issue_comment"],
    [mockPullRequestReviewContext, "pull_request_review"],
    [mockPullRequestReviewCommentContext, "pull_request_review_comment"],
  ] as [ParsedGitHubContext, string][])(
    "checks the PR author, not the actor, on %#: %s events",
    async (context) => {
      const { octokit, calls } = octokitWithPermission("write");
      await getUntrustedPrDisallowedTools(
        octokit,
        withPrAuthor(context, "the-pr-author"),
      );
      expect(calls).toEqual(["the-pr-author"]);
    },
  );

  test("treats a failed lookup as untrusted, without retrying a 404", async () => {
    let attempts = 0;
    const octokit = {
      repos: {
        getCollaboratorPermissionLevel: async () => {
          attempts++;
          throw httpError(404);
        },
      },
    } as any;
    expect(
      await getUntrustedPrDisallowedTools(
        octokit,
        mockPullRequestOpenedContext,
      ),
    ).toEqual(UNTRUSTED_PR_DISALLOWED_TOOLS);
    expect(attempts).toBe(1);
  });

  test.each([[{ "retry-after": "1" }], [{ "x-ratelimit-remaining": "0" }]])(
    "retries a rate-limited 403 (%j)",
    async (headers) => {
      let attempts = 0;
      const octokit = {
        repos: {
          getCollaboratorPermissionLevel: async () => {
            attempts++;
            if (attempts === 1) {
              throw Object.assign(httpError(403), { response: { headers } });
            }
            return { data: { permission: "write" } };
          },
        },
      } as any;
      expect(
        await getUntrustedPrDisallowedTools(
          octokit,
          mockPullRequestOpenedContext,
        ),
      ).toEqual([]);
      expect(attempts).toBe(2);
    },
  );

  test("does not retry a plain 403", async () => {
    let attempts = 0;
    const octokit = {
      repos: {
        getCollaboratorPermissionLevel: async () => {
          attempts++;
          throw Object.assign(httpError(403), {
            response: { headers: { "x-ratelimit-remaining": "42" } },
          });
        },
      },
    } as any;
    expect(
      await getUntrustedPrDisallowedTools(
        octokit,
        mockPullRequestOpenedContext,
      ),
    ).toEqual(UNTRUSTED_PR_DISALLOWED_TOOLS);
    expect(attempts).toBe(1);
  });

  test("retries a transient failure before deciding", async () => {
    let attempts = 0;
    const octokit = {
      repos: {
        getCollaboratorPermissionLevel: async () => {
          attempts++;
          if (attempts === 1) throw httpError(503);
          return { data: { permission: "write" } };
        },
      },
    } as any;
    expect(
      await getUntrustedPrDisallowedTools(
        octokit,
        mockPullRequestOpenedContext,
      ),
    ).toEqual([]);
    expect(attempts).toBe(2);
  });

  test("treats a missing author as untrusted without a lookup", async () => {
    const payload = mockPullRequestOpenedContext.payload as any;
    const context = {
      ...mockPullRequestOpenedContext,
      payload: {
        ...payload,
        pull_request: { ...payload.pull_request, user: null },
      },
    } as ParsedGitHubContext;
    const { octokit, calls } = octokitWithPermission("admin");
    expect(await getUntrustedPrDisallowedTools(octokit, context)).toEqual(
      UNTRUSTED_PR_DISALLOWED_TOOLS,
    );
    expect(calls).toEqual([]);
  });

  test("treats bot authors as untrusted without a lookup", async () => {
    const { octokit, calls } = octokitWithPermission("admin");
    expect(
      await getUntrustedPrDisallowedTools(
        octokit,
        withPrAuthor(mockPullRequestOpenedContext, "dependabot[bot]"),
      ),
    ).toEqual(UNTRUSTED_PR_DISALLOWED_TOOLS);
    expect(calls).toEqual([]);
  });

  test.each(["false", "False", "FALSE", " false "])(
    "is turned off by %p",
    async (value) => {
      process.env.RESTRICT_UNTRUSTED_PRS = value;
      const { octokit, calls } = octokitWithPermission("none");
      expect(
        await getUntrustedPrDisallowedTools(
          octokit,
          mockPullRequestOpenedContext,
        ),
      ).toEqual([]);
      expect(calls).toEqual([]);
    },
  );

  test.each([undefined, "", "true", "True", "flase", "no"])(
    "stays on for %p",
    async (value) => {
      if (value === undefined) delete process.env.RESTRICT_UNTRUSTED_PRS;
      else process.env.RESTRICT_UNTRUSTED_PRS = value;
      const { octokit } = octokitWithPermission("none");
      expect(
        await getUntrustedPrDisallowedTools(
          octokit,
          mockPullRequestOpenedContext,
        ),
      ).toEqual(UNTRUSTED_PR_DISALLOWED_TOOLS);
    },
  );

  test("counts allowed Bash rules the list does not cover", async () => {
    process.env.CLAUDE_ARGS = `--allowedTools "Read,Bash(bun:*),Bash(./scripts/test.sh),Bash(git:*),Bash(gh pr view:*)"`;
    const { octokit } = octokitWithPermission("none");
    await getUntrustedPrDisallowedTools(octokit, mockPullRequestOpenedContext);
    expect(uncoveredWarning()).toStartWith("3 Bash rule(s)");
  });

  test("counts a bare Bash rule", async () => {
    process.env.CLAUDE_ARGS = `--allowedTools "Read,Bash"`;
    const { octokit } = octokitWithPermission("none");
    await getUntrustedPrDisallowedTools(octokit, mockPullRequestOpenedContext);
    expect(uncoveredWarning()).toStartWith("1 Bash rule(s)");
  });

  test("does not count rules the list denies", async () => {
    process.env.CLAUDE_ARGS = `--allowedTools "Bash(bun install),Bash(bun test:*),Bash(bun run format),Bash(npm),Bash(git config user.name:*)"`;
    const { octokit } = octokitWithPermission("none");
    await getUntrustedPrDisallowedTools(octokit, mockPullRequestOpenedContext);
    expect(uncoveredWarning()).toBeUndefined();
  });

  test("does not mistake a longer command for a denied one", async () => {
    process.env.CLAUDE_ARGS = `--allowedTools "Bash(gofmt:*)"`;
    const { octokit } = octokitWithPermission("none");
    await getUntrustedPrDisallowedTools(octokit, mockPullRequestOpenedContext);
    expect(uncoveredWarning()).toStartWith("1 Bash rule(s)");
  });

  test("handles unquoted rules the same as quoted ones", async () => {
    process.env.CLAUDE_ARGS = `--allowedTools Bash(bun:*),Bash(npm:*)`;
    const { octokit } = octokitWithPermission("none");
    await getUntrustedPrDisallowedTools(octokit, mockPullRequestOpenedContext);
    expect(uncoveredWarning()).toBeUndefined();
  });

  test("never prints the content of claude_args or a raw error", async () => {
    const secret = "not-a-real-secret-value";
    process.env.CLAUDE_ARGS = `--allowedTools "Bash(curl -H ${secret}:*)"`;
    const octokit = {
      repos: {
        getCollaboratorPermissionLevel: async () => {
          throw Object.assign(new Error(`failed with ${secret}`), {
            status: 404,
          });
        },
      },
    } as any;
    await getUntrustedPrDisallowedTools(octokit, mockPullRequestOpenedContext);
    const logged = [
      ...warnings(),
      ...logSpy.mock.calls.flat(),
      ...errorSpy.mock.calls.flat(),
    ].join("\n");
    expect(logged).toContain("HTTP 404");
    expect(logged).toContain("1 Bash rule(s)");
    expect(logged).not.toContain(secret);
  });

  test.each([
    "--dangerously-skip-permissions",
    "--allow-dangerously-skip-permissions",
    "--permission-mode bypassPermissions",
    "--permission-mode=bypassPermissions",
    `--permission-mode "bypassPermissions"`,
  ])("warns when claude_args has %s", async (flag) => {
    process.env.CLAUDE_ARGS = flag;
    const { octokit } = octokitWithPermission("none");
    await getUntrustedPrDisallowedTools(octokit, mockPullRequestOpenedContext);
    expect(warnings().some((w) => w.includes("permission checks"))).toBe(true);
  });

  test.each([
    "--permission-mode auto",
    "--permission-mode auto\n# --permission-mode bypassPermissions",
  ])("does not warn about permission checks for %j", async (claudeArgs) => {
    process.env.CLAUDE_ARGS = claudeArgs;
    const { octokit } = octokitWithPermission("none");
    await getUntrustedPrDisallowedTools(octokit, mockPullRequestOpenedContext);
    expect(warnings().some((w) => w.includes("permission checks"))).toBe(false);
  });

  test("keeps a synchronous client failure out of the log", async () => {
    const secret = "not-a-real-secret-value";
    const octokit = {
      repos: {
        getCollaboratorPermissionLevel: () => {
          throw new Error(`failed with ${secret}`);
        },
      },
    } as any;
    expect(
      await getUntrustedPrDisallowedTools(
        octokit,
        mockPullRequestOpenedContext,
      ),
    ).toEqual(UNTRUSTED_PR_DISALLOWED_TOOLS);
    const logged = [
      ...warnings(),
      ...logSpy.mock.calls.flat(),
      ...errorSpy.mock.calls.flat(),
    ].join("\n");
    expect(logged).toContain("no response");
    expect(logged).not.toContain(secret);
  });

  test.each([
    ["a trailing comment line", `--model x\n# a note`],
    ["a trailing inline comment", `--model x # a note`],
    ["other deny rules", `--disallowedTools "WebFetch"`],
  ])("reaches the SDK alongside claude_args with %s", (_, claudeArgs) => {
    const { sdkOptions } = parseSdkOptions({
      claudeArgs,
      disallowedTools: UNTRUSTED_PR_DISALLOWED_TOOLS.join(","),
    });
    expect(sdkOptions.disallowedTools).toEqual(
      expect.arrayContaining([...UNTRUSTED_PR_DISALLOWED_TOOLS]),
    );
  });

  test("adds no deny rules to the SDK when there are none", () => {
    const { sdkOptions } = parseSdkOptions({
      claudeArgs: "--model x",
      disallowedTools: [].join(","),
    });
    expect(sdkOptions.disallowedTools).toBeUndefined();
  });
});
