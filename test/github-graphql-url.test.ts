import { describe, expect, test } from "bun:test";
import { join } from "node:path";

// The GitHub client reads GITHUB_API_URL / GITHUB_GRAPHQL_URL when
// `src/github/api/config.ts` is first imported, so we cannot flip env vars
// between cases inside a single process. Instead each case runs the real
// `createOctokit` factory in a fresh Bun process (test/fixtures/graphql-endpoint-probe.ts)
// with a stubbed fetch that reports the FINAL wire URL and Authorization header.
//
// This is the level that matters: @octokit/graphql derives the GraphQL endpoint
// from its baseUrl AFTER construction (rewriting a REST ".../api/v3" base to
// ".../api/graphql", and otherwise appending "/graphql"), so a constructor-option
// assertion would not catch a regression.

const PROBE = join(import.meta.dir, "fixtures", "graphql-endpoint-probe.ts");

type ProbeResult = {
  graphqlUrl: string;
  graphqlAuth: string | null;
  restUrl: string;
  restAuth: string | null;
};

function probe(env: Record<string, string>): ProbeResult {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", PROBE],
    env: {
      ...process.env,
      // Start from a clean slate so the host's own env cannot leak in.
      GITHUB_API_URL: "",
      GITHUB_GRAPHQL_URL: "",
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `probe failed (exit ${result.exitCode}): ${result.stderr.toString()}`,
    );
  }

  return JSON.parse(result.stdout.toString().trim()) as ProbeResult;
}

describe("GitHub API client endpoint routing", () => {
  test("both env vars unset: REST and GraphQL use github.com", () => {
    const r = probe({});
    expect(r.restUrl).toBe("https://api.github.com/meta");
    expect(r.graphqlUrl).toBe("https://api.github.com/graphql");
  });

  test("GITHUB_API_URL alone (GHES): GraphQL still resolves to /api/graphql", () => {
    // Regression guard: @octokit/graphql rewrites a ".../api/v3" REST base to
    // ".../api/graphql", so GraphQL must keep working when only GITHUB_API_URL
    // is provided (e.g. under `act` or partial configs).
    const r = probe({ GITHUB_API_URL: "https://ghe.example.test/api/v3" });
    expect(r.restUrl).toBe("https://ghe.example.test/api/v3/meta");
    expect(r.graphqlUrl).toBe("https://ghe.example.test/api/graphql");
  });

  test("GITHUB_GRAPHQL_URL alone: GraphQL honors it exactly, REST stays public", () => {
    const r = probe({
      GITHUB_GRAPHQL_URL: "https://ghe.example.test/api/graphql",
    });
    expect(r.graphqlUrl).toBe("https://ghe.example.test/api/graphql");
    expect(r.restUrl).toBe("https://api.github.com/meta");
  });

  test("both set to standard GHES values: REST and GraphQL route independently", () => {
    const r = probe({
      GITHUB_API_URL: "https://ghe.example.test/api/v3",
      GITHUB_GRAPHQL_URL: "https://ghe.example.test/api/graphql",
    });
    expect(r.restUrl).toBe("https://ghe.example.test/api/v3/meta");
    expect(r.graphqlUrl).toBe("https://ghe.example.test/api/graphql");
  });

  test("GITHUB_GRAPHQL_URL wins over a GITHUB_API_URL-derived endpoint", () => {
    // Distinguishing case: without honoring GITHUB_GRAPHQL_URL, GraphQL would be
    // derived from GITHUB_API_URL and hit the wrong host.
    const r = probe({
      GITHUB_API_URL: "https://ghe.example.test/api/v3",
      GITHUB_GRAPHQL_URL: "https://gql.example.test/api/graphql",
    });
    expect(r.graphqlUrl).toBe("https://gql.example.test/api/graphql");
    expect(r.restUrl).toBe("https://ghe.example.test/api/v3/meta");
  });

  test("trailing slash on GITHUB_GRAPHQL_URL is normalized", () => {
    const r = probe({
      GITHUB_GRAPHQL_URL: "https://ghe.example.test/api/graphql/",
    });
    expect(r.graphqlUrl).toBe("https://ghe.example.test/api/graphql");
  });

  test("GITHUB_GRAPHQL_URL without a /graphql suffix is preserved before the client appends one", () => {
    const r = probe({
      GITHUB_GRAPHQL_URL: "https://gql.example.test/custom",
    });
    expect(r.graphqlUrl).toBe("https://gql.example.test/custom/graphql");
  });

  test("a base already ending in /graphql is not doubled", () => {
    const r = probe({
      GITHUB_GRAPHQL_URL: "https://gql.example.test/api/graphql",
    });
    expect(r.graphqlUrl).not.toContain("/graphql/graphql");
    expect(r.graphqlUrl).toBe("https://gql.example.test/api/graphql");
  });

  test("the token authorization header is preserved on both clients", () => {
    const r = probe({
      GITHUB_API_URL: "https://ghe.example.test/api/v3",
      GITHUB_GRAPHQL_URL: "https://ghe.example.test/api/graphql",
    });
    expect(r.graphqlAuth).toBe("token test-token");
    expect(r.restAuth).toBe("token test-token");
  });
});
