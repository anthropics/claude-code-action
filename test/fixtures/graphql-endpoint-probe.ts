// Wire-level probe for the GitHub API client's endpoint routing.
//
// `src/github/api/config.ts` reads GITHUB_API_URL / GITHUB_GRAPHQL_URL at module
// load time, so each endpoint configuration has to be exercised in its own fresh
// process (the companion test spawns this file once per case with the relevant
// env vars set). We stub global fetch to capture the FINAL request URL and
// Authorization header — asserting constructor options is not enough because
// @octokit/graphql rewrites/append the path (".../api/v3" -> ".../api/graphql",
// otherwise it appends "/graphql") after the client is constructed.
import { createOctokit } from "../../src/github/api/client";

type Captured = { url: string; auth: string | null };
const captured: Captured[] = [];

globalThis.fetch = (async (input: any, init?: any) => {
  const url: string =
    typeof input === "string" ? input : (input?.url ?? String(input));
  const headers = new Headers(init?.headers ?? input?.headers);
  captured.push({ url, auth: headers.get("authorization") });
  return new Response(JSON.stringify({ data: {} }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

const octokits = createOctokit("test-token");

await octokits.graphql(`query { viewer { login } }`);
const graphql = captured[captured.length - 1]!;

await octokits.rest.request("GET /meta");
const rest = captured[captured.length - 1]!;

process.stdout.write(
  JSON.stringify({
    graphqlUrl: graphql.url,
    graphqlAuth: graphql.auth,
    restUrl: rest.url,
    restAuth: rest.auth,
  }),
);
