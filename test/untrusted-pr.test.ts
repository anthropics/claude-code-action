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
    warnings().find((w) => w.startsWith("These rules"));

  beforeEach(() => {
    warningSpy = spyOn(core, "warning").mockImplementation(() => {});
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
    process.env.RESTRICT_UNTRUSTED_PRS = "true";
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

  test.each([undefined, "", "false", "yes"])(
    "is off unless set to true (%p)",
    async (value) => {
      if (value === undefined) delete process.env.RESTRICT_UNTRUSTED_PRS;
      else process.env.RESTRICT_UNTRUSTED_PRS = value;
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

  test.each(["true", "True", "TRUE", " true "])(
    "accepts %p as on",
    async (value) => {
      process.env.RESTRICT_UNTRUSTED_PRS = value;
      const { octokit } = octokitWithPermission("none");
      expect(
        await getUntrustedPrDisallowedTools(
          octokit,
          mockPullRequestOpenedContext,
        ),
      ).toEqual(UNTRUSTED_PR_DISALLOWED_TOOLS);
    },
  );

  test("warns about allowed Bash rules the list does not cover", async () => {
    process.env.CLAUDE_ARGS = `--allowedTools "Read,Bash(bun:*),Bash(./scripts/test.sh),Bash(git:*),Bash(gh pr view:*)"`;
    const { octokit } = octokitWithPermission("none");
    await getUntrustedPrDisallowedTools(octokit, mockPullRequestOpenedContext);
    expect(uncoveredWarning()).toEndWith(
      "Bash(./scripts/test.sh), Bash(git:*), Bash(gh pr view:*)",
    );
  });

  test("warns about a bare Bash rule", async () => {
    process.env.CLAUDE_ARGS = `--allowedTools "Read,Bash"`;
    const { octokit } = octokitWithPermission("none");
    await getUntrustedPrDisallowedTools(octokit, mockPullRequestOpenedContext);
    expect(uncoveredWarning()).toEndWith(": Bash");
  });

  test("does not report rules the list denies as staying allowed", async () => {
    process.env.CLAUDE_ARGS = `--allowedTools "Bash(bun install),Bash(bun test:*),Bash(bun run format),Bash(npm),Bash(git config user.name:*)"`;
    const { octokit } = octokitWithPermission("none");
    await getUntrustedPrDisallowedTools(octokit, mockPullRequestOpenedContext);
    expect(uncoveredWarning()).toBeUndefined();
  });

  test("does not mistake a longer command for a denied one", async () => {
    process.env.CLAUDE_ARGS = `--allowedTools "Bash(gofmt:*)"`;
    const { octokit } = octokitWithPermission("none");
    await getUntrustedPrDisallowedTools(octokit, mockPullRequestOpenedContext);
    expect(uncoveredWarning()).toEndWith(": Bash(gofmt:*)");
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
