import type { Octokits } from "../github/api/client";
import type { ParsedGitHubContext } from "../github/context";
import { redactSecrets, sanitizeContent } from "../github/utils/sanitizer";
import type { Turn } from "./format-turns";

const SUMMARY_COMMENT_MARKER = "<!-- claude-code-action:agent-summary -->";
const MAX_SUMMARY_COMMENT_LENGTH = 60_000;
const TRUNCATION_NOTICE = "\n\n_(Summary truncated.)_";

export type AgentSummaryContext = Pick<
  ParsedGitHubContext,
  "entityNumber" | "runId"
> & {
  repository: Pick<ParsedGitHubContext["repository"], "owner" | "repo">;
};

export type AgentSummaryCommentResult = "created" | "updated" | "skipped";

function getFinalResponse(turns: Turn[]): string | undefined {
  for (let index = turns.length - 1; index >= 0; index--) {
    const turn = turns[index];
    if (turn?.type !== "result") continue;

    if (turn.subtype !== "success" || typeof turn.result !== "string") {
      return undefined;
    }

    const response = redactSecrets(sanitizeContent(turn.result)).trim();
    return response || undefined;
  }

  return undefined;
}

function createCommentBody(summary: string, runUrl: string): string {
  const prefix = `${SUMMARY_COMMENT_MARKER}\n\n`;
  const suffix = `\n\n---\n\n[View workflow run](${runUrl})`;
  const summaryLimit =
    MAX_SUMMARY_COMMENT_LENGTH - prefix.length - suffix.length;

  if (summary.length <= summaryLimit) {
    return `${prefix}${summary}${suffix}`;
  }

  const truncatedLimit = summaryLimit - TRUNCATION_NOTICE.length;
  return `${prefix}${summary.slice(0, truncatedLimit)}${TRUNCATION_NOTICE}${suffix}`;
}

/**
 * Create or update the single final-response comment for an agent-mode PR run.
 */
export async function postAgentSummaryComment(
  turns: Turn[],
  context: AgentSummaryContext,
  octokit: Octokits,
  serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com",
): Promise<AgentSummaryCommentResult> {
  const summary = getFinalResponse(turns);
  if (!summary) return "skipped";

  const { owner, repo } = context.repository;
  const normalizedServerUrl = serverUrl.replace(/\/+$/, "");
  const runUrl = [
    normalizedServerUrl,
    owner,
    repo,
    "actions",
    "runs",
    context.runId,
  ].join("/");
  const body = createCommentBody(summary, runUrl);

  const comments = await octokit.rest.paginate(
    octokit.rest.issues.listComments,
    {
      owner,
      repo,
      issue_number: context.entityNumber,
      per_page: 100,
    },
  );
  const existingComment = comments.find((comment) =>
    comment.body?.includes(SUMMARY_COMMENT_MARKER),
  );

  if (existingComment) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existingComment.id,
      body,
    });
    return "updated";
  }

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: context.entityNumber,
    body,
  });
  return "created";
}
