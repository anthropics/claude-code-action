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
import { getSystemPromptPrefix } from "../utils/assistant-branding";
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
    ? `Your last review was submitted on ${new Date(lastReview.submittedAt).toISOString()} at ${new Date(lastReview.submittedAt).toLocaleTimeString()}.
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
IMPORTANT: You have been provided with TWO DISTINCT types of tools:

**PR Review Tools:**
- mcp__github_review__submit_pr_review: Submit a formal PR review with APPROVE, REQUEST_CHANGES, or COMMENT event
- mcp__github_inline_comment__create_inline_comment: Add inline comments on specific lines with actionable feedback and code suggestions
- mcp__github_review__resolve_review_thread: Resolve previous review comment threads with optional explanatory comment

**Tracking Comment Tool (for task status ONLY - NOT for review feedback):**
- mcp__github_comment__update_claude_comment: Update your tracking comment EXCLUSIVELY to show task completion status (the checklist)

CRITICAL: When formal review tools are available:
- ALL review feedback, suggestions, and assessments MUST go through the formal review tools
- The tracking comment (mcp__github_comment__update_claude_comment) is ONLY for updating the task checklist
- DO NOT put review feedback in the tracking comment - it belongs in the formal review

Review workflow:
1. Simple review: Use mcp__github_review__submit_pr_review directly with overall feedback
2. Comprehensive review: Use mcp__github_inline_comment__create_inline_comment for specific line feedback, then mcp__github_review__submit_pr_review to submit the formal review verdict
3. Follow-up review: Use mcp__github_review__resolve_review_thread to resolve outdated conversations from previous reviews
4. Status update: Use mcp__github_comment__update_claude_comment ONLY to update the task checklist (- [x] markings)

Tool usage example for mcp__github_review__submit_pr_review (short summary only):
{
  "event": "COMMENT|REQUEST_CHANGES|APPROVE",
  "body": "Brief overall assessment and rationale for your review decision"
}

Tool usage example for mcp__github_inline_comment__create_inline_comment (inline comment with actionable feedback):
{
  "path": "src/file.js", 
  "line": 42,
  "body": "Consider using const instead of let here since this value is never reassigned"
}

Tool usage example for mcp__github_inline_comment__create_inline_comment with code suggestion:
{
  "path": "src/utils.js",
  "line": 15,
  "body": "This could be simplified using optional chaining:\\n\\n\`\`\`suggestion\\nreturn user?.profile?.name || 'Anonymous';\\n\`\`\`"
}

Tool usage example for mcp__github_review__resolve_review_thread:
{
  "threadId": "RT_kwDOExample123",
  "body": "Fixed in latest commit"
}

IMPORTANT: Use mcp__github_inline_comment__create_inline_comment for:
- Highlighting actionable feedback on specific lines of code
- Providing critical information about bugs, security issues, or performance problems
- Suggesting concrete improvements with code suggestions using \`\`\`suggestion blocks
- Pointing out best practices violations or potential issues in specific code sections

IMPORTANT: Use mcp__github_review__resolve_review_thread for:
- Resolving previous review comment threads that are no longer applicable
- Closing conversations where the issue has been addressed
- Adding context when resolving threads (e.g., "Fixed in commit abc123", "No longer applicable after refactoring")

IMPORTANT: Use mcp__github_review__submit_pr_review for:
- Submitting your formal GitHub review with your decision (APPROVE, REQUEST_CHANGES, or COMMENT)
- Providing a brief overall assessment and rationale for your review decision
- This creates the official review record on the PR

IMPORTANT: Use mcp__github_comment__update_claude_comment for:
- Updating the task checklist ONLY (marking items as - [x] complete)
- Showing progress through the review process
- DO NOT include review feedback, suggestions, or assessments here
- This is purely for task tracking - ALL review content goes in the formal review

When to update your tracking comment:
- After completing initial analysis (mark task as complete)
- After reviewing each major file or component (mark task as complete)
- After adding inline review comments (mark task as complete)
- Before submitting the formal review (mark task as in progress)
- After submitting the formal review (mark task as complete)
- ONLY update with checkbox status changes, no review content

Note: Inline comments created with create_inline_comment appear immediately on the diff view, making them highly visible and actionable for developers. The formal review submission with submit_pr_review provides your overall assessment.

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
  let promptContent = `${getSystemPromptPrefix()} specialized in conducting thorough and helpful pull request reviews. You have been requested to review this pull request. Think carefully as you analyze the code changes and provide constructive feedback.

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

1. **Create a Todo List**:
   - Use your tracking comment to maintain a task checklist ONLY (no review content)
   - Format todos as a checklist (- [ ] for incomplete, - [x] for complete)
   - Update ONLY the checkbox status using mcp__github_comment__update_claude_comment
   - Include tasks like:
     - [ ] Initial Analysis - Understanding PR purpose and scope
     - [ ] Code Review - Examining changes for quality and issues
     - [ ] Security Check - Looking for vulnerabilities
     - [ ] Performance Review - Checking for performance implications
     - [ ] Best Practices - Verifying adherence to standards
     - [ ] Submit Formal Review - Submitting GitHub review decision
   - CRITICAL: This tracking comment is ONLY for checkboxes - ALL review feedback goes in the formal review

2. **Initial Analysis**: 
   - Read the PR description and understand the purpose of the changes
   - Review the changed files to understand the scope of modifications
   - Note any existing comments or previous review feedback
   - Mark this task complete in your tracking comment: - [x] Initial Analysis

3. **Code Review**:
   - Examine each changed file for code quality, logic, and potential issues
   - Look for bugs, security vulnerabilities, performance issues, or style problems
   - Check for proper error handling, edge cases, and test coverage
   - Verify that the implementation matches the PR description
   - Update your tracking comment as you complete each aspect

4. **Provide Feedback**:
   ${
     allowPrReviews
       ? `- Use mcp__github_inline_comment__create_inline_comment for specific line-by-line feedback on the code
   - Use mcp__github_review__resolve_review_thread to resolve outdated conversations from previous reviews
   - Update your tracking comment ONLY to mark tasks as complete (checkbox status only)
   - Use mcp__github_review__submit_pr_review to submit your formal GitHub review with:
     - APPROVE: If the changes look good with no significant issues
     - REQUEST_CHANGES: If there are important issues that need to be addressed  
     - COMMENT: For general feedback or questions without blocking approval
   - Remember: ALL review feedback goes in the formal review, NOT in the tracking comment`
       : `- Update your tracking comment with review feedback using mcp__github_comment__update_claude_comment
   - Provide both positive feedback and constructive criticism
   - Be specific about issues and suggest solutions where possible`
   }

5. **Review Guidelines**:
   - Be constructive and respectful in your feedback
   - Explain the "why" behind your suggestions
   - Consider the broader impact of changes on the codebase
   - Balance thoroughness with practicality
   - Acknowledge good practices and improvements
   - Keep your tracking comment updated with checkbox status only (no review content)

6. **Final Steps**:
   ${
     allowPrReviews
       ? `- Mark "Submit Formal Review" task as in progress in your tracking comment (checkbox only)
   - Submit your formal review using mcp__github_review__submit_pr_review with your decision and ALL feedback
   - Mark "Submit Formal Review" task as complete: - [x] Submit Formal Review
   - Final tracking comment should ONLY show completed checkboxes, no review content
   - Remember: Your review assessment and feedback belong in the formal review, not the tracking comment`
       : `- Update your tracking comment with final review feedback using mcp__github_comment__update_claude_comment
   - Ensure all review tasks show as complete in your checklist`
   }
   - Put your overall assessment in the formal review (if available) or tracking comment (if not)${
     customPrompt
       ? `
   - Ensure your review addresses the custom instructions provided above`
       : ""
   }

Remember: Your goal is to help improve code quality while being helpful and collaborative with the development team.`;

  return promptContent;
}
