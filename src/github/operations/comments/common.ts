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

export function createCommentBody(
  jobRunLink: string,
  branchLink: string = "",
  botName: string = "",
): string {
  const header = botName ? `<!-- bot: ${botName} -->\n` : "";
  return `${header}Claude Code is working… ${SPINNER_HTML}

I'll analyze this and get back to you.

${jobRunLink}${branchLink}`;
}

/**
 * Extracts the bot header from a comment body if present.
 * The bot header is used for sticky comment identification.
 * Format: <!-- bot: bot-name -->
 *
 * @param body - The comment body to extract the header from
 * @returns The bot header including trailing newline if present, empty string otherwise
 */
export function extractBotHeader(body: string): string {
  const match = body.match(/^(<!--\s*bot:\s*\S+\s*-->\n?)/);
  return match?.[1] ?? "";
}
