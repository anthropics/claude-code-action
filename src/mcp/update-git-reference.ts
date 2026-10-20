import fetch, { type RequestInit, type Response } from "node-fetch";
import { GITHUB_API_URL } from "../github/api/config";
import { retryWithBackoff, type RetryOptions } from "../utils/retry";

type GitHubFetch = (
  url: string,
  init: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "text">>;

type UpdateGitReferenceOptions = {
  owner: string;
  repo: string;
  branch: string;
  sha: string;
  githubToken: string;
  fetchFn?: GitHubFetch;
  retryOptions?: Omit<RetryOptions, "shouldRetry">;
};

class GitReferenceUpdateError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GitReferenceUpdateError";
  }
}

function shouldRetryGitReferenceUpdate(error: Error): boolean {
  if (!(error instanceof GitReferenceUpdateError)) {
    return true;
  }

  return error.status === 403 || error.status === 429 || error.status >= 500;
}

export async function updateGitReference({
  owner,
  repo,
  branch,
  sha,
  githubToken,
  fetchFn = fetch,
  retryOptions,
}: UpdateGitReferenceOptions): Promise<void> {
  const updateRefUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/refs/heads/${branch}`;

  await retryWithBackoff(
    async () => {
      const response = await fetchFn(updateRefUrl, {
        method: "PATCH",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${githubToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sha, force: false }),
      });

      if (response.ok) {
        return;
      }

      const errorText = await response.text();
      if (response.status === 403) {
        throw new GitReferenceUpdateError(
          response.status,
          `Permission denied: Unable to push commits to branch '${branch}'. ` +
            `Please rebase your branch from the main/master branch to allow Claude to commit.\n\n` +
            `Original error: ${errorText}`,
        );
      }

      throw new GitReferenceUpdateError(
        response.status,
        `Failed to update reference: ${response.status} - ${errorText}`,
      );
    },
    {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      backoffFactor: 2,
      ...retryOptions,
      shouldRetry: shouldRetryGitReferenceUpdate,
    },
  );
}
