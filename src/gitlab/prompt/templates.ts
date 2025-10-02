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

  return `Please review the merge request and provide:
1. High-level summary of the changes
2. Specific findings with severity (suggestion/issue/critical)
3. Testing guidance if needed
4. Highlight any risks or follow-ups

Changed files:
${summary}`;
}

