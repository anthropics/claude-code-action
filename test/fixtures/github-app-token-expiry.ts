import { mock, setSystemTime } from "bun:test";
import * as core from "@actions/core";
import type { Octokits } from "../../src/github/api/client";
import type { ParsedGitHubContext } from "../../src/github/context";
import { createInitialComment } from "../../src/github/operations/comments/create-initial";

const oidcToken = "test-oidc-token";
const appToken = process.env.OVERRIDE_GITHUB_TOKEN || "test-installation-token";
const expiresAt = Date.now() + 60 * 60 * 1000;
const exchangeUrl =
  "https://api.anthropic.com/api/github/github-app-token-exchange";

mock.module("@actions/core", () => ({
  ...core,
  getIDToken: async (audience: string) => {
    if (audience !== "claude-code-github-action") {
      throw new Error("Unexpected OIDC audience");
    }
    return oidcToken;
  },
}));

mock.module("../../src/modes/tag/index", () => ({
  prepareTagMode: async ({
    octokit,
    context,
  }: {
    octokit: Octokits;
    context: ParsedGitHubContext;
  }) => {
    const comment = await createInitialComment(octokit.rest, context);
    return {
      commentId: comment.id,
      branchInfo: { baseBranch: "main" },
      claudeArgs: "",
    };
  },
}));

mock.module("../../base-action/src/setup-claude-code-settings", () => ({
  setupClaudeCodeSettings: async () => {},
}));

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: async function* () {
    yield { type: "system", subtype: "init", session_id: "test-session" };
    if (process.env.TEST_INSTALLATION_TOKEN_EXPIRES === "true") {
      setSystemTime(new Date(expiresAt + 1));
    }
    yield { type: "result", subtype: "success", is_error: false };
  },
}));

globalThis.fetch = Object.assign(
  async (
    input: ConstructorParameters<typeof Request>[0],
    init?: RequestInit,
  ) => {
    const request = new Request(input, init);
    const authorization = request.headers.get("authorization");
    if (
      request.url === exchangeUrl &&
      authorization === `Bearer ${oidcToken}`
    ) {
      return Response.json({ token: appToken });
    }

    const url = new URL(request.url);
    if (url.origin !== process.env.GITHUB_API_URL) {
      throw new Error(`Unexpected fetch to ${url.origin}`);
    }

    if (authorization !== `token ${appToken}` || Date.now() >= expiresAt) {
      return Response.json({ message: "Bad credentials" }, { status: 401 });
    }

    switch (`${request.method} ${url.pathname}`) {
      case "GET /repos/test-owner/test-repo/collaborators/contributor/permission":
        return Response.json({ permission: "write" });
      case "POST /repos/test-owner/test-repo/issues/7/comments":
      case "GET /repos/test-owner/test-repo/issues/comments/42":
      case "PATCH /repos/test-owner/test-repo/issues/comments/42":
        return Response.json({ id: 42, body: "Claude Code is working…" });
      default:
        return Response.json({ message: "Not Found" }, { status: 404 });
    }
  },
  globalThis.fetch,
);
