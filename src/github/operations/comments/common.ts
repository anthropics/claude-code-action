import { GITHUB_SERVER_URL } from "../../api/config";

export const SPINNER_HTML =
  '<img src="https://github.com/user-attachments/assets/5ac382c7-e004-429b-8e35-7feb3e8f9c6f" width="14px" height="14px" style="vertical-align: middle; margin-left: 4px;" />';

export function createJobRunUrl(repository: string, runId: string): string {
  const runUrl = `${GITHUB_SERVER_URL}/${repository}/actions/runs/${runId}`;
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT;
  return runAttempt ? `${runUrl}/attempts/${runAttempt}` : runUrl;
}

export function createJobRunLink(
  owner: string,
  repo: string,
  runId: string,
): string {
  const jobRunUrl = createJobRunUrl(`${owner}/${repo}`, runId);
  return `[View job run](${jobRunUrl})`;
}

/** Encode Git-ref path segments without turning `/` into `%2F`. */
export function encodeBranchNameForUrl(branchName: string): string {
  return branchName.split("/").map(encodeURIComponent).join("/");
}

export function createBranchLink(
  owner: string,
  repo: string,
  branchName: string,
): string {
  const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${encodeBranchNameForUrl(branchName)}`;
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
