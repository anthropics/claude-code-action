import { GITHUB_API_URL } from "../github/api/config";
import { encodeBranchNameForUrl } from "../github/operations/comments/common";

/**
 * Builds the REST URL for a branch's git reference.
 *
 * The branch name is percent-encoded per path segment so that characters
 * that are valid in a ref name but significant in a URL (notably `#`, which
 * starts a fragment) reach GitHub instead of being dropped by the client.
 */
export function buildBranchRefUrl(
  owner: string,
  repo: string,
  branch: string,
): string {
  return `${GITHUB_API_URL}/repos/${owner}/${repo}/git/refs/heads/${encodeBranchNameForUrl(branch)}`;
}
