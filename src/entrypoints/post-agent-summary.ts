import { existsSync, readFileSync } from "fs";
import type { Octokits } from "../github/api/client";
import {
  isEntityContext,
  type GitHubContext,
  type ParsedGitHubContext,
} from "../github/context";
import { redactSecrets, sanitizeContent } from "../github/utils/sanitizer";
import type { Turn } from "./format-turns";

const SUMMARY_COMMENT_MARKER = "<!-- claude-code-action:agent-summary -->";
// These are the REST comment author IDs, separate from the git commit identity.
const CLAUDE_COMMENT_AUTHOR_ID = 209825114;
const WORKFLOW_COMMENT_AUTHOR_ID = 41898282;
const MAX_SUMMARY_COMMENT_LENGTH = 60_000;
const TRUNCATION_NOTICE = "\n\n_(Summary truncated.)_";

type PostAgentSummaryOptions = {
  agentMode: boolean;
  enabled: boolean;
  claudeSuccess: boolean;
  context: GitHubContext | undefined;
  executionFile: string | undefined;
  octokit: Octokits | undefined;
  tokenType?: "claude-app" | "workflow" | "custom";
  serverUrl?: string;
};

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

async function upsertSummaryComment(
  summary: string,
  context: ParsedGitHubContext,
  octokit: Octokits,
  serverUrl: string,
  tokenType: NonNullable<PostAgentSummaryOptions["tokenType"]>,
): Promise<"created" | "updated"> {
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
  const summaries = comments.filter((comment) =>
    comment.body?.startsWith(`${SUMMARY_COMMENT_MARKER}\n\n`),
  );
  let authorId: number | undefined =
    tokenType === "claude-app" ? CLAUDE_COMMENT_AUTHOR_ID : undefined;
  if (tokenType === "workflow") authorId = WORKFLOW_COMMENT_AUTHOR_ID;
  if (tokenType === "custom" && summaries.length > 0) {
    try {
      authorId = (await octokit.rest.users.getAuthenticated()).data.id;
    } catch {
      // Installation tokens cannot use /user. Without a verified author,
      // create a comment instead of attempting to overwrite someone else's.
    }
  }
  const existingComment =
    authorId === undefined
      ? undefined
      : summaries.find((comment) => comment.user?.id === authorId);

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

export async function postAgentSummaryComment({
  agentMode,
  enabled,
  claudeSuccess,
  context,
  executionFile,
  octokit,
  tokenType = "claude-app",
  serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com",
}: PostAgentSummaryOptions): Promise<void> {
  if (
    !agentMode ||
    !enabled ||
    !claudeSuccess ||
    !context ||
    !isEntityContext(context) ||
    !context.isPR ||
    !octokit ||
    !executionFile ||
    !existsSync(executionFile)
  ) {
    return;
  }

  try {
    const turns: Turn[] = JSON.parse(readFileSync(executionFile, "utf-8"));
    const summary = getFinalResponse(turns);
    if (!summary) {
      console.log("Skipping PR summary comment: no final response was found");
      return;
    }

    const result = await upsertSummaryComment(
      summary,
      context,
      octokit,
      serverUrl,
      tokenType,
    );
    console.log(
      `${result === "created" ? "Posted" : "Updated"} final Claude response on pull request #${context.entityNumber}`,
    );
  } catch (error) {
    console.error("Error posting final Claude response:", error);
  }
}
