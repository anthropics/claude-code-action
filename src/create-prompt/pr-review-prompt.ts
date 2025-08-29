import type { PreparedContext } from "./types";
import type { FetchDataResult } from "../github/data/fetcher";
import {
  formatContext,
  formatBody,
  formatComments,
  formatReviewComments,
  formatChangedFilesWithSHA,
} from "../github/data/formatter";
import { sanitizeContent } from "../github/utils/sanitizer";
import { findLastReviewFromUser, getCommitsSinceReview } from "./index";

/**
 * Generates a specialized prompt for PR review mode that incorporates custom user prompts
 * into the review context while maintaining all the rich GitHub context.
 */
export function generatePrReviewPrompt(
  context: PreparedContext,
  githubData: FetchDataResult,
  _useCommitSigning: boolean = false,
  allowPrReviews: boolean = false,
  customPrompt?: string,
): string {
  const {
    contextData,
    comments,
    changedFilesWithSHA,
    reviewData,
    imageUrlMap,
  } = githubData;
  const { eventData } = context;

  // Format all the GitHub context data
  const formattedContext = formatContext(contextData, eventData.isPR);
  const formattedComments = formatComments(comments, imageUrlMap);
  const formattedReviewComments = eventData.isPR
    ? formatReviewComments(reviewData, imageUrlMap)
    : "";
  const formattedChangedFiles = eventData.isPR
    ? formatChangedFilesWithSHA(changedFilesWithSHA)
    : "";

  // Handle images
  const hasImages = imageUrlMap && imageUrlMap.size > 0;
  const imagesInfo = hasImages
    ? `

<images_info>
Images have been downloaded from GitHub comments and saved to disk. Their file paths are included in the formatted comments and body above. You can use the Read tool to view these images.
</images_info>`
    : "";

  const formattedBody = contextData?.body
    ? formatBody(contextData.body, imageUrlMap)
    : "No description provided";

  // Build review request context for PR reviews
  let reviewRequestContext = "";
  if (
    eventData.eventName === "pull_request" &&
    (eventData as any).eventAction === "review_requested" &&
    eventData.isPR
  ) {
    const requestedReviewer = (eventData as any).requestedReviewer;
    const lastReview = requestedReviewer
      ? findLastReviewFromUser(reviewData, requestedReviewer)
      : null;
    const commitsSinceReview =
      lastReview && contextData
        ? getCommitsSinceReview(
            (contextData as any).commits?.nodes || [],
            lastReview.submittedAt,
          )
        : [];

    reviewRequestContext = `<review_request_context>
You have been requested to review this pull request.
${requestedReviewer ? `The reviewer trigger matched: ${requestedReviewer}` : ""}
${
  lastReview
    ? `Your last review was submitted on ${new Date(lastReview.submittedAt).toLocaleDateString()} at ${new Date(lastReview.submittedAt).toLocaleTimeString()}.
Review ID: ${lastReview.id}
${
  commitsSinceReview.length > 0
    ? `\nCommits since your last review:${commitsSinceReview
        .slice(0, 10)
        .map(
          (commit) =>
            `\n- ${commit.oid.substring(0, 8)}: ${commit.message.split("\n")[0]}`,
        )
        .join(
          "",
        )}${commitsSinceReview.length > 10 ? `\n... and ${commitsSinceReview.length - 10} more commits` : ""}`
    : "\nNo new commits since your last review."
}`
    : "This appears to be your first review of this pull request."
}
</review_request_context>`;
  }

  // Custom prompt injection section
  const customPromptSection = customPrompt
    ? `

<custom_review_instructions>
You have been provided with specific instructions for this review:

${sanitizeContent(customPrompt)}

Please follow these custom instructions while conducting your review, in addition to the standard review practices outlined below.
</custom_review_instructions>`
    : "";

  // Build the review tools information
  const reviewToolsInfo = allowPrReviews
    ? `<review_tool_info>
IMPORTANT: You have been provided with PR review tools to submit formal GitHub reviews:
- mcp__github_review__submit_pr_review: Submit a PR review with APPROVE, REQUEST_CHANGES, or COMMENT event
- mcp__github_review__add_review_comment: Add inline comments on specific lines with actionable feedback and code suggestions (automatically batched into a pending review)

Review workflow:
1. Simple review: Use mcp__github_review__submit_pr_review directly with overall feedback
2. Comprehensive review: Use mcp__github_review__add_review_comment for specific line feedback (comments are automatically batched), then mcp__github_review__submit_pr_review to submit the complete review

Tool usage example for mcp__github_review__submit_pr_review (short summary only):
{
  "event": "COMMENT|REQUEST_CHANGES|APPROVE",
  "body": "Brief overall assessment and rationale for your review decision"
}

Tool usage example for mcp__github_review__add_review_comment (inline comment with actionable feedback):
{
  "path": "src/file.js", 
  "line": 42,
  "body": "Consider using const instead of let here since this value is never reassigned"
}

Tool usage example for mcp__github_review__add_review_comment with code suggestion:
{
  "path": "src/utils.js",
  "line": 15,
  "body": "This could be simplified using optional chaining:\\n\\n\`\`\`suggestion\\nreturn user?.profile?.name || 'Anonymous';\\n\`\`\`"
}

IMPORTANT: Use mcp__github_review__add_review_comment for:
- Highlighting actionable feedback on specific lines of code
- Providing critical information about bugs, security issues, or performance problems
- Suggesting concrete improvements with code suggestions using \`\`\`suggestion blocks
- Pointing out best practices violations or potential issues in specific code sections

Note: When you use add_review_comment, a pending review is automatically created. All subsequent comments are added to this pending review until you submit it with submit_pr_review. The inline comments appear directly on the diff view, making them highly visible and actionable for developers.

Use COMMENT for general feedback, REQUEST_CHANGES to request changes, or APPROVE to approve the PR.
</review_tool_info>`
    : `<comment_tool_info>
IMPORTANT: You have been provided with the mcp__github_comment__update_claude_comment tool to update your comment. This tool automatically handles both issue and PR comments.

Tool usage example for mcp__github_comment__update_claude_comment:
{
  "body": "Your comment text here"
}
Only the body parameter is required - the tool automatically knows which comment to update.
</comment_tool_info>`;

  // Generate the complete prompt
  let promptContent = `You are Claude, an AI assistant specialized in conducting thorough and helpful pull request reviews. You have been requested to review this pull request. Think carefully as you analyze the code changes and provide constructive feedback.

<formatted_context>
${formattedContext}
</formatted_context>

<pr_or_issue_body>
${formattedBody}
</pr_or_issue_body>

<comments>
${formattedComments || "No comments"}
</comments>

<review_comments>
${formattedReviewComments || "No review comments"}
</review_comments>

<changed_files>
${formattedChangedFiles || "No files changed"}
</changed_files>${imagesInfo}

${reviewRequestContext}${customPromptSection}

<repository>${context.repository}</repository>
${eventData.isPR && "prNumber" in eventData ? `<pr_number>${eventData.prNumber}</pr_number>` : ""}
<claude_comment_id>${context.claudeCommentId}</claude_comment_id>
<trigger_username>${context.triggerUsername ?? "Unknown"}</trigger_username>

${reviewToolsInfo}

Your task is to conduct a thorough pull request review. Here's how to approach it:

## Review Process:

1. **Initial Analysis**: 
   - Read the PR description and understand the purpose of the changes
   - Review the changed files to understand the scope of modifications
   - Note any existing comments or previous review feedback

2. **Code Review**:
   - Examine each changed file for code quality, logic, and potential issues
   - Look for bugs, security vulnerabilities, performance issues, or style problems
   - Check for proper error handling, edge cases, and test coverage
   - Verify that the implementation matches the PR description

3. **Provide Feedback**:
   ${
     allowPrReviews
       ? `- Use mcp__github_review__add_review_comment for specific line-by-line feedback
   - Use mcp__github_review__submit_pr_review with:
     - APPROVE: If the changes look good with no significant issues
     - REQUEST_CHANGES: If there are important issues that need to be addressed  
     - COMMENT: For general feedback or questions without blocking approval`
       : `- Update your tracking comment with review feedback using mcp__github_comment__update_claude_comment
   - Provide both positive feedback and constructive criticism
   - Be specific about issues and suggest solutions where possible`
   }

4. **Review Guidelines**:
   - Be constructive and respectful in your feedback
   - Explain the "why" behind your suggestions
   - Consider the broader impact of changes on the codebase
   - Balance thoroughness with practicality
   - Acknowledge good practices and improvements

5. **Final Steps**:
   - Always update your GitHub comment to show the review status
   - Summarize your overall assessment of the pull request${
     customPrompt
       ? `
   - Ensure your review addresses the custom instructions provided above`
       : ""
   }

Remember: Your goal is to help improve code quality while being helpful and collaborative with the development team.`;

  return promptContent;
}
