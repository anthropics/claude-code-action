import { Octokit } from "@octokit/rest";
import { graphql } from "@octokit/graphql";
import { GITHUB_API_URL, GITHUB_GRAPHQL_URL } from "./config";

export type Octokits = {
  rest: Octokit;
  graphql: typeof graphql;
};

export function createOctokit(token: string): Octokits {
  return {
    rest: new Octokit({
      auth: token,
      baseUrl: GITHUB_API_URL,
    }),
    graphql: graphql.defaults({
      baseUrl: GITHUB_GRAPHQL_URL,
      headers: {
        authorization: `token ${token}`,
      },
    }),
  };
}
