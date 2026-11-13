// Preloaded in a separate MCP server process so mocks cannot affect other tests.
import { mock } from "bun:test";

const scenario = process.env.TEST_INLINE_COMMENT_RESPONSE;

if (scenario === "cleanup") {
  mock.module("../../src/mcp/inline-comment-buffer", () => ({
    removeBufferedComment: () => {
      throw new Error("Buffer cleanup failed after publishing");
    },
  }));
}

globalThis.fetch = (async (input, init) => {
  const url = typeof input === "string" ? input : (input as Request).url;
  if (
    init?.method === "GET" &&
    url === "https://api.github.com/repos/example/project/pulls/37"
  ) {
    return Response.json({ head: { sha: "b".repeat(40) } });
  }
  if (
    init?.method !== "POST" ||
    url !== "https://api.github.com/repos/example/project/pulls/37/comments"
  ) {
    throw new Error(`Unexpected GitHub request: ${init?.method} ${url}`);
  }
  if (scenario === "transport") {
    throw new TypeError("fetch failed after sending the comment");
  }
  const status = scenario === "cleanup" ? 201 : Number(scenario);
  return Response.json(
    status === 201
      ? {
          id: 81,
          html_url: "https://github.com/example/project/pull/37#discussion_r81",
          path: "src/index.ts",
          line: 7,
        }
      : {
          message:
            status === 422 ? "Validation Failed" : "GitHub request failed",
          private_diagnostic: "do-not-copy",
        },
    { status, headers: { "x-private-diagnostic": "do-not-copy" } },
  );
}) as typeof fetch;
