import { GITHUB_SERVER_URL } from "../../api/config";

/**
 * Hidden HTML comment used to identify comments created by this action.
 * When sticky comments are enabled, we search for this marker to find and
 * update existing comments instead of creating new ones.
 */
export const COMMENT_MARKER = "<!-- claude-code-action -->";

export const SPINNER_HTML =
  '<img src="https://github.com/user-attachments/assets/5ac382c7-e004-429b-8e35-7feb3e8f9c6f" width="14px" height="14px" style="vertical-align: middle; margin-left: 4px;" />';

/**
 * Check whether a comment body contains the claude-code-action marker.
 */
export function hasCommentMarker(body: string | null | undefined): boolean {
  return !!body && body.includes(COMMENT_MARKER);
}

export function createJobRunLink(
  owner: string,
  repo: string,
  runId: string,
): string {
  const jobRunUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/actions/runs/${runId}`;
  return `[View job run](${jobRunUrl})`;
}

export function createBranchLink(
  owner: string,
  repo: string,
  branchName: string,
): string {
  const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${branchName}`;
  return `\n[View branch](${branchUrl})`;
}

export function createCommentBody(
  jobRunLink: string,
  branchLink: string = "",
): string {
  return `${COMMENT_MARKER}
Claude Code is working… ${SPINNER_HTML}

I'll analyze this and get back to you.

${jobRunLink}${branchLink}`;
}
