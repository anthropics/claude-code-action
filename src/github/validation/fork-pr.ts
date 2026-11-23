import type { Octokit } from "@octokit/rest";
import { retryWithBackoff } from "../../utils/retry";
import { toLookupError, type LookupError } from "./untrusted-pr";
import {
  isEntityContext,
  isWorkflowRunEvent,
  type GitHubContext,
} from "../context";

type Repository = { id?: number } | null | undefined;

// A deleted fork has no repository.
const isSameRepository = (head: Repository, base: Repository): boolean =>
  typeof head?.id === "number" && head.id === base?.id;

// Only "true" allows forks, so a mistyped or empty value refuses them.
export const forksAllowed = (): boolean =>
  process.env.ALLOW_FORK_PRS?.trim().toLowerCase() === "true";

/**
 * Whether allow_fork_prs is off and the event says that it is about a fork's pull
 * request, or follows a workflow run of a fork's code. Needs no token. A comment on
 * a pull request's conversation doesn't say: see isCommentOnRefusedForkPr.
 */
export function isRefusedForkEvent(context: GitHubContext): boolean {
  if (forksAllowed()) return false;

  if (isWorkflowRunEvent(context)) {
    const { workflow_run: run, repository } = context.payload;
    return !isSameRepository(run?.head_repository, repository);
  }
  if (isEntityContext(context) && "pull_request" in context.payload) {
    const { head, base } = context.payload.pull_request;
    return !isSameRepository(head.repo, base.repo);
  }
  return false;
}

/**
 * Whether allow_fork_prs is off and the event is a comment on the conversation of a
 * fork's pull request. Throws if that can't be found out.
 */
export async function isCommentOnRefusedForkPr(
  octokit: Octokit,
  context: GitHubContext,
): Promise<boolean> {
  if (
    forksAllowed() ||
    !isEntityContext(context) ||
    !context.isPR ||
    "pull_request" in context.payload
  ) {
    return false;
  }

  const { owner, repo } = context.repository;
  const lookUp = async () => {
    try {
      return await octokit.pulls.get({
        owner,
        repo,
        pull_number: context.entityNumber,
      });
    } catch (error) {
      throw toLookupError(error);
    }
  };
  const { data } = await retryWithBackoff(lookUp, {
    initialDelayMs: 1000,
    shouldRetry: (error) => (error as LookupError).retryable,
  }).catch((error: LookupError) => {
    // Only the bounded text from toLookupError reaches the log.
    throw new Error(
      `Could not find out whether pull request #${context.entityNumber} is from a fork (${error.message}). The token needs pull-requests: read.`,
    );
  });
  return !isSameRepository(data.head.repo, data.base.repo);
}
