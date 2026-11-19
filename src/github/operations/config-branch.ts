import type { ParsedGitHubContext } from "../context";
import { validateBranchName } from "./branch";

// Tag mode pushes a fork's commits to these.
const FORK_BRANCH = /^pr-\d+$/;

/**
 * Returns the branch to restore Claude's config from on a pull request: the base, or
 * for an untrusted author the base_branch input or the default branch. A pull request
 * that targets the default branch keeps its base, as does a bot's in this repository,
 * unless the base holds a fork's commits.
 *
 * @param isFork - Whether the checked-out head is in a fork. Read only for
 *   issue_comment events. Undefined counts as a fork.
 */
export function chooseConfigBranch(
  context: ParsedGitHubContext,
  baseBranch: string,
  isAuthorUntrusted: boolean,
  isFork?: boolean,
): string {
  const { payload, repository, inputs } = context;
  const { user } =
    "pull_request" in payload ? payload.pull_request : payload.issue;
  // A deleted fork has no head repository.
  const isSameRepository =
    "pull_request" in payload
      ? payload.pull_request.head.repo?.full_name?.toLowerCase() ===
        repository.full_name.toLowerCase()
      : isFork === false;
  const { default_branch: defaultBranch } = repository;
  // The pull request's author names its head branch, so that is never trusted.
  const inputBranch =
    "pull_request" in payload &&
    payload.pull_request.head.ref === inputs.baseBranch
      ? undefined
      : inputs.baseBranch;
  if (
    !isAuthorUntrusted ||
    (isSameRepository &&
      user?.type === "Bot" &&
      !FORK_BRANCH.test(baseBranch)) ||
    (defaultBranch && baseBranch === defaultBranch)
  ) {
    return baseBranch;
  }
  const branch = inputBranch || defaultBranch;
  if (!branch) {
    throw new Error(
      "Could not find the repository's default branch in the event. Set the base_branch input to the branch to take Claude's config from.",
    );
  }
  validateBranchName(branch);
  return branch;
}
