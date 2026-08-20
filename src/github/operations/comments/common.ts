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

export function createBranchLink(
  owner: string,
  repo: string,
  branchName: string,
): string {
  const branchUrl = `${GITHUB_SERVER_URL}/${owner}/${repo}/tree/${branchName}`;
  return `\n[View branch](${branchUrl})`;
}

/**
 * Build the optional "Model: … · Effort: …" line shown in tracking comments.
 * Returns an empty string when neither value is set so callers can omit the
 * line entirely rather than rendering empty fields.
 */
export function buildModelEffortLine(model?: string, effort?: string): string {
  const parts: string[] = [];
  if (model) parts.push(`**Model:** ${model}`);
  if (effort) parts.push(`**Effort:** ${effort}`);
  return parts.join(" · ");
}

export function createCommentBody(
  jobRunLink: string,
  branchLink: string = "",
  model?: string,
  effort?: string,
): string {
  const modelEffortLine = buildModelEffortLine(model, effort);
  const configSection = modelEffortLine ? `${modelEffortLine}\n\n` : "";

  return `Claude Code is working… ${SPINNER_HTML}

${configSection}I'll analyze this and get back to you.

${jobRunLink}${branchLink}`;
}
