import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { resolve } from "node:path";

describe("inline review thread tools", () => {
  let api: ReturnType<typeof Bun.serve>;
  let clients: Client[];
  let mutations: string[];
  let listRequests: Array<Record<string, unknown>>;

  beforeEach(() => {
    clients = [];
    mutations = [];
    listRequests = [];
    api = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        if (new URL(request.url).pathname !== "/fixture/graphql") {
          return new Response(null, { status: 404 });
        }
        const { query, variables } = (await request.json()) as {
          query: string;
          variables: Record<string, unknown>;
        };
        if (query.includes("query ListReviewThreads")) {
          listRequests.push(variables);
          const hasNextPage = !variables.cursor;
          return Response.json({
            data: {
              repository: {
                pullRequest: {
                  reviewThreads: {
                    nodes: [
                      {
                        id: hasNextPage ? "first" : "second",
                        path: "src/example.ts",
                        line: 25,
                        startLine: null,
                        isResolved: !hasNextPage,
                        isOutdated: false,
                        viewerCanResolve: hasNextPage,
                        comments: {
                          totalCount: 6,
                          nodes: [
                            {
                              author: { login: "reviewer" },
                              body: "Please handle empty inputs. <!-- hidden -->",
                              url: "https://example.invalid/review",
                              createdAt: "2025-01-01T00:00:00Z",
                            },
                            null,
                          ],
                        },
                      },
                      null,
                    ],
                    pageInfo: { hasNextPage, endCursor: "cursor" },
                  },
                },
              },
            },
          });
        }
        const { threadId } = variables;
        if (typeof threadId !== "string")
          return new Response(null, { status: 400 });
        if (query.includes("query GetReviewThread")) {
          return Response.json({
            data: {
              node: {
                isResolved: threadId === "already-resolved",
                viewerCanResolve: threadId !== "no-permission",
                pullRequest: {
                  number: threadId === "other-pr" ? 84 : 42,
                  repository: {
                    nameWithOwner:
                      threadId === "other-repo" ? "other/repo" : "Fixture/Repo",
                  },
                },
              },
            },
          });
        }
        if (query.includes("mutation ResolveReviewThread")) {
          mutations.push(threadId);
          return Response.json({
            data: {
              resolveReviewThread: {
                thread: { id: threadId, isResolved: true },
              },
            },
          });
        }
        return new Response(null, { status: 400 });
      },
    });
  });

  afterEach(async () => {
    await Promise.all(clients.map((client) => client.close()));
    await api.stop(true);
  });

  async function openClient(allowResolve = false) {
    const client = new Client({ name: "fixture", version: "1.0.0" });
    clients.push(client);
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [
          "--no-env-file",
          "run",
          resolve(
            import.meta.dir,
            "../src/mcp/github-inline-comment-server.ts",
          ),
        ],
        env: {
          GITHUB_TOKEN: "fixture-token",
          GITHUB_GRAPHQL_URL: `${api.url.origin}/fixture/graphql`,
          REPO_OWNER: "fixture",
          REPO_NAME: "repo",
          PR_NUMBER: "42",
          ENABLE_RESOLVE_REVIEW_THREAD: String(allowResolve),
        },
      }),
    );
    return client;
  }

  async function call(
    client: Client,
    name: string,
    args: Record<string, unknown>,
  ) {
    const response = CallToolResultSchema.parse(
      await client.callTool({ name, arguments: args }),
    );
    const content = response.content[0];
    if (content?.type !== "text") throw new Error("Expected a text result");
    return { text: content.text, isError: response.isError };
  }

  test("lists scoped threads and follows the pagination cursor without enabling resolution", async () => {
    const client = await openClient();
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    expect(tools).toContain("create_inline_comment");
    expect(tools).toContain("list_review_threads");
    expect(tools).not.toContain("resolve_review_thread");

    const page = JSON.parse(
      (await call(client, "list_review_threads", {})).text,
    );
    expect(page.threads).toHaveLength(1);
    expect(page.threads[0]).toMatchObject({
      id: "first",
      isResolved: false,
      commentCount: 6,
      comments: [{ author: { login: "reviewer" } }],
    });
    expect(page.threads[0].comments[0].body).not.toContain("hidden");
    expect(page.nextCursor).toBe("cursor");

    const next = JSON.parse(
      (await call(client, "list_review_threads", { cursor: page.nextCursor }))
        .text,
    );
    expect(next.threads[0]).toMatchObject({ id: "second", isResolved: true });
    expect(next.nextCursor).toBeNull();
    expect(listRequests).toEqual([
      { owner: "fixture", repo: "repo", number: 42 },
      { owner: "fixture", repo: "repo", number: 42, cursor: "cursor" },
    ]);
  });

  test("only mutates an unresolved thread the token can resolve on the current PR", async () => {
    const client = await openClient(true);
    for (const threadId of ["other-pr", "other-repo", "no-permission"]) {
      const response = await call(client, "resolve_review_thread", {
        threadId,
      });
      expect(response.isError).toBe(true);
    }
    const alreadyResolved = await call(client, "resolve_review_thread", {
      threadId: "already-resolved",
    });
    expect(JSON.parse(alreadyResolved.text)).toMatchObject({
      isResolved: true,
    });
    expect(mutations).toEqual([]);

    const resolved = await call(client, "resolve_review_thread", {
      threadId: "first",
    });
    expect(JSON.parse(resolved.text)).toEqual({
      id: "first",
      isResolved: true,
    });
    expect(mutations).toEqual(["first"]);
  });
});
