import type { MergeRequestContext } from "../context/types";

function formatChangeSummary(context: MergeRequestContext): string {
  const files = context.changes.map((change) => {
    const status = change.new_file
      ? "added"
      : change.deleted_file
        ? "deleted"
        : change.renamed_file
          ? "renamed"
          : "modified";

    return `- ${change.new_path} (${status})`;
  });

  return files.join("\n");
}

export function buildSystemPrompt(context: MergeRequestContext): string {
  return `You are Claude, assisting with code review for a GitLab merge request.
Provide concise, actionable feedback. Prioritize critical issues but include
useful improvements. When suggesting changes include code snippets only where
necessary. Avoid redundant comments if the issue is already addressed.

Project: ${context.project.path_with_namespace}
Merge Request: !${context.mergeRequest.iid} ${context.mergeRequest.title}
Source Branch: ${context.mergeRequest.source_branch}
Target Branch: ${context.mergeRequest.target_branch}`;
}

export function buildUserPrompt(context: MergeRequestContext): string {
  const summary = formatChangeSummary(context);

  return `Please review the merge request and respond with ONLY a valid JSON object (no markdown, no code fences) in this exact format:

{
  "summary": {
    "highLevelSummary": "string describing the overall changes",
    "testingGuidance": "optional string with testing advice",
    "risks": ["optional", "array", "of", "risk", "strings"]
  },
  "findings": [
    {
      "path": "file/path.ext",
      "line": 123,
      "severity": "suggestion|issue|critical",
      "title": "Brief title of the finding",
      "summary": "Detailed explanation of the issue",
      "suggestion": "optional code or fix suggestion"
    }
  ]
}

Changed files:
${summary}`;
}

