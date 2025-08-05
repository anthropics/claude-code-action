import * as core from "@actions/core";
import type { Mode, ModeOptions, ModeResult } from "../types";
import { checkContainsTrigger } from "../../github/validation/trigger";
import { createInitialComment } from "../../github/operations/comments/create-initial";
import { prepareMcpConfig } from "../../mcp/install-mcp-server";
import { fetchGitHubData } from "../../github/data/fetcher";
import type { FetchDataResult } from "../../github/data/fetcher";
import { createPrompt } from "../../create-prompt";
import type { PreparedContext } from "../../create-prompt";
import { isEntityContext, isPullRequestEvent } from "../../github/context";
import type { ParsedGitHubContext } from "../../github/context";
import {
  formatContext,
  formatBody,
  formatComments,
  formatReviewComments,
  formatChangedFilesWithSHA,
} from "../../github/data/formatter";

/**
 * Review mode implementation.
 *
 * Code review mode that uses the default GitHub Action token
 * and focuses on providing inline comments and suggestions.
 * Automatically includes GitHub MCP tools for review operations.
 */
export const reviewMode: Mode = {
  name: "experimental-review",
  description:
    "Experimental code review mode for inline comments and suggestions",

  shouldTrigger(context) {
    if (!isEntityContext(context)) {
      return false;
    }

    // Review mode only works on PRs
    if (!context.isPR) {
      return false;
    }

    // For pull_request events, only trigger on specific actions
    if (isPullRequestEvent(context)) {
      const allowedActions = ["opened", "synchronize", "reopened"];
      const action = context.payload.action;
      return allowedActions.includes(action);
    }

    // For other events (comments), check for trigger phrase
    return checkContainsTrigger(context);
  },

  prepareContext(context, data) {
    return {
      mode: "experimental-review",
      githubContext: context,
      commentId: data?.commentId,
      baseBranch: data?.baseBranch,
      claudeBranch: data?.claudeBranch,
    };
  },

  getAllowedTools() {
    return [
      // Context tools - to know who the current user is
      "mcp__github__get_me",
      // Core review tools
      "mcp__github__create_pending_pull_request_review",
      "mcp__github__add_comment_to_pending_review",
      "mcp__github__submit_pending_pull_request_review",
      "mcp__github__delete_pending_pull_request_review",
      "mcp__github__create_and_submit_pull_request_review",
      // Comment tools
      "mcp__github__add_issue_comment",
      // PR information tools
      "mcp__github__get_pull_request",
      "mcp__github__get_pull_request_reviews",
      "mcp__github__get_pull_request_status",
    ];
  },

  getDisallowedTools() {
    return [];
  },

  shouldCreateTrackingComment(context?: ParsedGitHubContext) {
    // Enable tracking comment only when both sticky comment and override prompt are provided
    if (
      context &&
      context.inputs.useStickyComment &&
      context.inputs.overridePrompt
    ) {
      return true;
    }
    return false; // Default: Review mode uses the review body instead of a tracking comment
  },

  generatePrompt(
    context: PreparedContext,
    githubData: FetchDataResult,
  ): string {
    // Support overridePrompt
    if (context.overridePrompt) {
      return context.overridePrompt;
    }

    const {
      contextData,
      comments,
      changedFilesWithSHA,
      reviewData,
      imageUrlMap,
    } = githubData;
    const { eventData } = context;

    const formattedContext = formatContext(contextData, true); // Reviews are always for PRs
    const formattedComments = formatComments(comments, imageUrlMap);
    const formattedReviewComments = formatReviewComments(
      reviewData,
      imageUrlMap,
    );
    const formattedChangedFiles =
      formatChangedFilesWithSHA(changedFilesWithSHA);
    const formattedBody = contextData?.body
      ? formatBody(contextData.body, imageUrlMap)
      : "No description provided";

    return `You are Claude, an AI assistant specialized in code reviews for GitHub pull requests. You are operating in REVIEW MODE, which means you should focus on providing thorough code review feedback using GitHub MCP tools for inline comments and suggestions.

<formatted_context>
${formattedContext}
</formatted_context>

<repository>${context.repository}</repository>
${eventData.isPR && eventData.prNumber ? `<pr_number>${eventData.prNumber}</pr_number>` : ""}

<comments>
${formattedComments || "No comments yet"}
</comments>

<review_comments>
${formattedReviewComments || "No review comments"}
</review_comments>

<changed_files>
${formattedChangedFiles}
</changed_files>

<formatted_body>
${formattedBody}
</formatted_body>

${
  (eventData.eventName === "issue_comment" ||
    eventData.eventName === "pull_request_review_comment" ||
    eventData.eventName === "pull_request_review") &&
  eventData.commentBody
    ? `<trigger_comment>
User @${context.triggerUsername}: ${eventData.commentBody}
</trigger_comment>`
    : ""
}

${
  context.directPrompt
    ? `<direct_prompt>
${context.directPrompt}
</direct_prompt>`
    : ""
}

REVIEW MODE WORKFLOW:

1. First, understand the PR context:
   - You are reviewing PR #${eventData.isPR && eventData.prNumber ? eventData.prNumber : "[PR number]"} in ${context.repository}
   - Use mcp__github__get_pull_request to get PR metadata
   - Use the Read, Grep, and Glob tools to examine the modified files directly from disk
   - This provides the full context and latest state of the code
   - Look at the changed_files section above to see which files were modified

2. Create a pending review:
   - Use mcp__github__create_pending_pull_request_review to start your review
   - This allows you to batch comments before submitting

3. Add inline comments:
   - Use mcp__github__add_comment_to_pending_review for each issue or suggestion
   - Parameters:
     * path: The file path (e.g., "src/index.js")
     * line: Line number for single-line comments
     * startLine & line: For multi-line comments (startLine is the first line, line is the last)
     * side: "LEFT" (old code) or "RIGHT" (new code)
     * subjectType: "line" for line-level comments
     * body: Your comment text
   
   - When to use multi-line comments:
     * When replacing multiple consecutive lines
     * When the fix requires changes across several lines
     * Example: To replace lines 19-20, use startLine: 19, line: 20
   
   - For code suggestions, use this EXACT format in the body:
     \`\`\`suggestion
     corrected code here
     \`\`\`
   
   CRITICAL: GitHub suggestion blocks must ONLY contain the replacement for the specific line(s) being commented on:
   - For single-line comments: Replace ONLY that line
   - For multi-line comments: Replace ONLY the lines in the range
   - Do NOT include surrounding context or function signatures
   - Do NOT suggest changes that span beyond the commented lines
   
   Example for line 19 \`var name = user.name;\`:
   WRONG:
   \\\`\\\`\\\`suggestion
   function processUser(user) {
       if (!user) throw new Error('Invalid user');
       const name = user.name;
   \\\`\\\`\\\`
   
   CORRECT:
   \\\`\\\`\\\`suggestion
   const name = user.name;
   \\\`\\\`\\\`
   
   For validation suggestions, comment on the function declaration line or create separate comments for each concern.

4. Submit your review:
   - Use mcp__github__submit_pending_pull_request_review
   - Parameters:
     * event: "COMMENT" (general feedback), "REQUEST_CHANGES" (issues found), or "APPROVE" (if appropriate)
     * body: Write a comprehensive review summary that includes:
       - Overview of what was reviewed (files, scope, focus areas)
       - Summary of all issues found (with counts by severity if applicable)
       - Key recommendations and action items
       - Highlights of good practices observed
       - Overall assessment and recommendation
   - The body should be detailed and informative since it's the main review content
   - Structure the body with clear sections using markdown headers

REVIEW GUIDELINES:

- Focus on:
  * Security vulnerabilities
  * Bugs and logic errors
  * Performance issues
  * Code quality and maintainability
  * Best practices and standards
  * Edge cases and error handling

- Provide:
  * Specific, actionable feedback
  * Code suggestions when possible (following GitHub's format exactly)
  * Clear explanations of issues
  * Constructive criticism
  * Recognition of good practices
  * For complex changes that require multiple modifications:
    - Create separate comments for each logical change
    - Or explain the full solution in text without a suggestion block

- Communication:
  * All feedback goes through GitHub's review system
  * Be professional and respectful
  * Your review body is the main communication channel

Before starting, analyze the PR inside <analysis> tags:
<analysis>
- PR title and description
- Number of files changed and scope
- Type of changes (feature, bug fix, refactor, etc.)
- Key areas to focus on
- Review strategy
</analysis>

Then proceed with the review workflow described above.

IMPORTANT: Your review body is the primary way users will understand your feedback. Make it comprehensive and well-structured with:
- Executive summary at the top
- Detailed findings organized by severity or category
- Clear action items and recommendations
- Recognition of good practices
This ensures users get value from the review even before checking individual inline comments.`;
  },

  async prepare({
    context,
    octokit,
    githubToken,
  }: ModeOptions): Promise<ModeResult> {
    if (!isEntityContext(context)) {
      throw new Error("Review mode requires entity context");
    }

    // Conditionally create tracking comment if sticky comment and override prompt are enabled
    let commentId: number | undefined;
    if (this.shouldCreateTrackingComment(context)) {
      const commentData = await createInitialComment(octokit.rest, context);
      commentId = commentData.id;
    } else if (
      context.inputs.useStickyComment &&
      !context.inputs.overridePrompt
    ) {
      // Warn if sticky comment is enabled but override prompt is missing
      core.warning(
        "use_sticky_comment is enabled in review mode, but override_prompt is not provided. " +
          "Sticky comments in review mode require both use_sticky_comment=true AND an override_prompt. " +
          "The default review behavior will be used instead.",
      );
    }

    const githubData = await fetchGitHubData({
      octokits: octokit,
      repository: `${context.repository.owner}/${context.repository.repo}`,
      prNumber: context.entityNumber.toString(),
      isPR: context.isPR,
      triggerUsername: context.actor,
    });

    // Review mode doesn't need branch setup or git auth since it only creates comments
    // Using minimal branch info since review mode doesn't create or modify branches
    const branchInfo = {
      baseBranch: "main",
      currentBranch: "",
      claudeBranch: undefined, // Review mode doesn't create branches
    };

    const modeContext = this.prepareContext(context, {
      commentId,
      baseBranch: branchInfo.baseBranch,
      claudeBranch: branchInfo.claudeBranch,
    });

    await createPrompt(reviewMode, modeContext, githubData, context);

    // Export tool environment variables for review mode
    const baseTools = [
      "Edit",
      "MultiEdit",
      "Glob",
      "Grep",
      "LS",
      "Read",
      "Write",
    ];

    // Add mode-specific and user-specified tools
    const modeTools = [...this.getAllowedTools()];

    // Add comment update tool if using sticky comments with override prompt
    if (this.shouldCreateTrackingComment(context)) {
      modeTools.push("mcp__github_comment__update_claude_comment");
    }

    const allowedTools = [
      ...baseTools,
      ...modeTools,
      ...context.inputs.allowedTools,
    ];
    const disallowedTools = [
      "WebSearch",
      "WebFetch",
      ...context.inputs.disallowedTools,
    ];

    // Export as INPUT_ prefixed variables for the base action
    core.exportVariable("INPUT_ALLOWED_TOOLS", allowedTools.join(","));
    core.exportVariable("INPUT_DISALLOWED_TOOLS", disallowedTools.join(","));

    const additionalMcpConfig = process.env.MCP_CONFIG || "";
    const mcpConfig = await prepareMcpConfig({
      githubToken,
      owner: context.repository.owner,
      repo: context.repository.repo,
      branch: branchInfo.claudeBranch || branchInfo.currentBranch,
      baseBranch: branchInfo.baseBranch,
      additionalMcpConfig,
      claudeCommentId: commentId?.toString(),
      allowedTools: dedupeStringArray([
        ...modeTools,
        ...context.inputs.allowedTools,
      ]),
      context,
    });

    core.setOutput("mcp_config", mcpConfig);

    return {
      commentId,
      branchInfo,
      mcpConfig,
    };
  },

  getSystemPrompt() {
    // Review mode doesn't need additional system prompts
    // The review-specific instructions are included in the main prompt
    return undefined;
  },
};

function dedupeStringArray(array: string[]): string[] {
  return Array.from(new Set(array));
}
