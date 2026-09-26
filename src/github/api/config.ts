export const GITHUB_API_URL =
  process.env.GITHUB_API_URL || "https://api.github.com";
export const GITHUB_SERVER_URL =
  process.env.GITHUB_SERVER_URL || "https://github.com";

// GraphQL base URL for @octokit/graphql. GitHub Actions exposes the full GraphQL
// endpoint in GITHUB_GRAPHQL_URL (e.g. "https://HOST/api/graphql"), while
// @octokit/graphql appends "/graphql" to whatever baseUrl it is given, so a
// single trailing "/graphql" is stripped here to avoid "/graphql/graphql".
// When GITHUB_GRAPHQL_URL is unset we fall back to GITHUB_API_URL, preserving the
// existing behavior where @octokit/graphql rewrites a REST ".../api/v3" base to
// ".../api/graphql". The trailing-slash trim keeps that rewrite working.
export const GITHUB_GRAPHQL_URL = (
  process.env.GITHUB_GRAPHQL_URL || GITHUB_API_URL
)
  .replace(/\/+$/, "")
  .replace(/\/graphql$/, "");
