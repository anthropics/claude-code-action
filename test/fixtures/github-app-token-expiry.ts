import { mock, setSystemTime } from "bun:test";
import * as core from "@actions/core";
import type { Octokits } from "../../src/github/api/client";
import type { ParsedGitHubContext } from "../../src/github/context";
import { createInitialComment } from "../../src/github/operations/comments/create-initial";
import * as gitConfig from "../../src/github/operations/git-config";

const appToken = process.env.OVERRIDE_GITHUB_TOKEN || "test-installation-token";
const renewedToken = "test-renewed-installation-token";
let oidcRequests = 0;
const expiresAt = Date.now() + 60 * 60 * 1000;
const exchangeUrl =
  "https://api.anthropic.com/api/github/github-app-token-exchange";

mock.module("@actions/core", () => ({
  ...core,
  getIDToken: async (audience: string) => {
    if (audience !== "claude-code-github-action") {
      throw new Error("Unexpected OIDC audience");
    }
    return `test-oidc-token-${++oidcRequests}`;
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
      branchInfo: {
        baseBranch: "main",
        claudeBranch: process.env.TEST_FINALIZATION_BRANCH,
      },
      claudeArgs: "",
    };
  },
}));

mock.module("../../src/github/operations/git-config", () => ({
  ...gitConfig,
  replaceCheckoutCredentials: async (token: string) => {
    if (token !== renewedToken || process.env.GH_TOKEN !== renewedToken) {
      throw new Error("Git was configured with the wrong token");
    }
    console.log("Fixture applied the renewed token to Git");
  },
}));

mock.module("../../base-action/src/setup-claude-code-settings", () => ({
  setupClaudeCodeSettings: async () => {},
}));

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: async function* () {
    yield { type: "system", subtype: "init", session_id: "test-session" };
    const elapsedMinutes = Number(process.env.TEST_SESSION_MINUTES);
    const startedAt = expiresAt - 60 * 60 * 1000;
    setSystemTime(new Date(startedAt + elapsedMinutes * 60 * 1000));
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
    if (request.url === exchangeUrl) {
      if (authorization === "Bearer test-oidc-token-1") {
        return Response.json({ token: appToken });
      }
      if (authorization === "Bearer test-oidc-token-2") {
        console.log("Fixture received a second token exchange");
        switch (process.env.TEST_RENEWAL_RESPONSE) {
          case "deny":
            return Response.json(
              { message: "Service unavailable" },
              { status: 503 },
            );
          case "reuse":
            return Response.json({ token: appToken });
          default:
            return Response.json({ token: renewedToken });
        }
      }
      throw new Error("Unexpected exchange assertion");
    }

    const url = new URL(request.url);
    if (url.origin !== process.env.GITHUB_API_URL) {
      throw new Error(`Unexpected fetch to ${url.origin}`);
    }

    if (request.method === "DELETE" && url.pathname === "/installation/token") {
      if (authorization !== `Bearer ${appToken}`) {
        throw new Error("Attempted to revoke the wrong token");
      }
      console.log("Fixture received revocation of the previous token");
      return new Response(null, {
        status: Date.now() >= expiresAt ? 401 : 204,
      });
    }

    const accepted =
      authorization === `token ${renewedToken}` ||
      (authorization === `token ${appToken}` && Date.now() < expiresAt);
    if (!accepted) {
      return Response.json({ message: "Bad credentials" }, { status: 401 });
    }

    switch (`${request.method} ${url.pathname}`) {
      case "GET /repos/test-owner/test-repo/collaborators/contributor/permission":
        return Response.json({ permission: "write" });
      case "POST /repos/test-owner/test-repo/issues/7/comments":
      case "GET /repos/test-owner/test-repo/issues/comments/42":
      case "PATCH /repos/test-owner/test-repo/issues/comments/42":
        return Response.json({ id: 42, body: "Claude Code is working…" });
      case "GET /repos/test-owner/test-repo/branches/claude-issue-7":
        return Response.json({ name: "claude-issue-7" });
      case "GET /repos/test-owner/test-repo/compare/main...claude-issue-7":
        return Response.json({ total_commits: 1 });
      default:
        return Response.json({ message: "Not Found" }, { status: 404 });
    }
  },
  globalThis.fetch,
);
