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
  
  // Find the change for this file to determine if it's new/modified
  const change = context.changes.find(c => c.new_path === finding.path);
  
  const payload: CreateDiscussionPayload = {
    body: buildInlineBody(finding),
    position: {
      position_type: "text",
      base_sha: diffRefs.base_sha,
      start_sha: diffRefs.start_sha,
      head_sha: diffRefs.head_sha,
      new_path: finding.path,
      new_line: finding.line,
      // For modified files, GitLab needs old_path to calculate line_code
      // For new files, omit old_path
      old_path: change?.new_file ? undefined : (change?.old_path || finding.path),
    },
  };

  await client.createDiscussion(context.iid, payload);
}

