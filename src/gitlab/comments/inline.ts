import type { GitLabClient } from "../api/client";
import type { ReviewFinding } from "../review/types";
import type { MergeRequestContext } from "../context/types";
import type { CreateDiscussionPayload } from "../api/types";

function buildInlineBody(finding: ReviewFinding): string {
  const severityEmoji = {
    suggestion: "💡",
    issue: "⚠️",
    critical: "🚨",
  }[finding.severity];

  const suggestionSection = finding.suggestion
    ? `
**Suggested fix:**

${"```"}
${finding.suggestion}
${"```"}`
    : "";

  return `${severityEmoji} **${finding.title}**

${finding.summary}${suggestionSection}`;
}

function findDiffRef(context: MergeRequestContext) {
  return context.mergeRequest.diff_refs;
}

export async function postInlineFinding(
  client: GitLabClient,
  context: MergeRequestContext,
  finding: ReviewFinding,
) {
  const diffRefs = findDiffRef(context);

  const payload: CreateDiscussionPayload = {
    body: buildInlineBody(finding),
    position: {
      position_type: "text",
      base_sha: diffRefs.base_sha,
      start_sha: diffRefs.start_sha,
      head_sha: diffRefs.head_sha,
      new_path: finding.path,
      new_line: finding.line,
    },
  };

  await client.createDiscussion(context.iid, payload);
}

