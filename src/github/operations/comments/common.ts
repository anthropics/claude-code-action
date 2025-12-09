import { GITHUB_SERVER_URL } from "../../api/config";

export const SPINNER_HTML =
  '<img src="https://github.com/user-attachments/assets/5ac382c7-e004-429b-8e35-7feb3e8f9c6f" width="14px" height="14px" style="vertical-align: middle; margin-left: 4px;" />';

export function createJobRunLink(
  owner: string,
  repo: string,
  runId: string,
): string {
  const jobRunUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/actions/runs/${runId}`;
  return `[View job run](${jobRunUrl})`;
}

/**
 * Encodes a branch name for use in a URL, preserving forward slashes.
 * GitHub expects literal slashes in branch names (e.g., /tree/feature/branch)
 * but other special characters like parentheses need to be encoded.
 * Note: encodeURIComponent doesn't encode ( ) ! ' * ~ per RFC 3986,
 * but parentheses break markdown links so we encode them manually.
 */
function encodeBranchName(branchName: string): string {
  return encodeURIComponent(branchName)
    .replace(/%2F/gi, "/")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

export function createBranchLink(
  owner: string,
  repo: string,
  branchName: string,
): string {
  const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${encodeBranchName(branchName)}`;
  return `\n[View branch](${branchUrl})`;
}

export function createCommentBody(
  jobRunLink: string,
  branchLink: string = "",
): string {
  return `Claude Code is working… ${SPINNER_HTML}

I'll analyze this and get back to you.

${jobRunLink}${branchLink}`;
}
