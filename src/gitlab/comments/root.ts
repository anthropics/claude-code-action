import type { GitLabClient } from "../api/client";
import type { ReviewResult } from "../review/types";
import type { MergeRequestContext } from "../context/types";

function buildSummaryBody(result: ReviewResult): string {
  const findings = result.findings
    .map((finding) => `- **${finding.severity.toUpperCase()}** ${finding.path}${finding.line ? `:${finding.line}` : ""} — ${finding.title}`)
    .join("\n");

  const risks = result.summary.risks?.length
    ? `
**Risks**
${result.summary.risks.map((risk) => `- ${risk}`).join("\n")}`
    : "";

  const testing = result.summary.testingGuidance
    ? `
**Testing**
${result.summary.testingGuidance}`
    : "";

  return `## Claude Review Summary

${result.summary.highLevelSummary}

**Findings**
${findings || "- No specific findings"}
${risks}
${testing}`;
}

export async function ensureSummaryComment(
  client: GitLabClient,
  context: MergeRequestContext,
  result: ReviewResult,
) {
  const body = buildSummaryBody(result);
  await client.createSystemNote(context.iid, body);
}

