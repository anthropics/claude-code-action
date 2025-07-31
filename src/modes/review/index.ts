import * as core from "@actions/core";
import type { Mode, ModeOptions, ModeResult } from "../types";
import { checkContainsTrigger } from "../../github/validation/trigger";
import { createInitialComment } from "../../github/operations/comments/create-initial";
import { setupBranch } from "../../github/operations/branch";
import { configureGitAuth } from "../../github/operations/git-config";
import { prepareMcpConfig } from "../../mcp/install-mcp-server";
import { fetchGitHubData } from "../../github/data/fetcher";
import type { FetchDataResult } from "../../github/data/fetcher";
import { createPrompt } from "../../create-prompt";
import type { PreparedContext } from "../../create-prompt";
import { isEntityContext } from "../../github/context";
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
  name: "review",
  description: "Code review mode for inline comments and suggestions",

  shouldTrigger(context) {
    return (
      isEntityContext(context) &&
      (context.eventName === "pull_request" || checkContainsTrigger(context))
    );
  },

  prepareContext(context, data) {
    return {
      mode: "review",
      githubContext: context,
      commentId: data?.commentId,
      baseBranch: data?.baseBranch,
      claudeBranch: data?.claudeBranch,
    };
  },

  getAllowedTools() {
    return [
      "mcp__github__*",
      "mcp__github_comment__*",
      // Explicitly list review tools in case wildcards aren't working
      "mcp__github__create_pending_pull_request_review",
      "mcp__github__add_comment_to_pending_review", 
      "mcp__github__submit_pending_pull_request_review",
      "mcp__github__get_pull_request",
      "mcp__github__get_pull_request_diff",
      "mcp__github__get_pull_request_files"
    ];
  },

  getDisallowedTools() {
    return [];
  },

  shouldCreateTrackingComment() {
    return true;
  },

  generatePrompt(
    context: PreparedContext,
    githubData: FetchDataResult,
  ): string {
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
   - Use mcp__github__get_pull_request to get PR metadata
   - Use mcp__github__get_pull_request_diff to see all changes
   - Use mcp__github__get_pull_request_files to list modified files
   - Read specific files using the Read tool for deeper analysis

2. Create a pending review:
   - Use mcp__github__create_pending_pull_request_review to start your review
   - This allows you to batch comments before submitting

3. Add inline comments:
   - Use mcp__github__add_comment_to_pending_review for each issue or suggestion
   - Parameters:
     * path: The file path (e.g., "src/index.js")
     * line: Line number for single-line comments
     * startLine & line: For multi-line comments
     * side: "LEFT" (old code) or "RIGHT" (new code)
     * subjectType: "line" for line-level comments
     * body: Your comment text
   
   - For code suggestions, use this format in the body:
     \`\`\`suggestion
     corrected code here
     \`\`\`

4. Submit your review:
   - Use mcp__github__submit_pending_pull_request_review
   - Parameters:
     * event: "COMMENT" (general feedback), "REQUEST_CHANGES" (issues found), or "APPROVE" (if appropriate)
     * body: Overall review summary

5. Update tracking comment with detailed summary:
   - Use mcp__github_comment__update_claude_comment to provide a comprehensive review summary
   - Include:
     * Overview of all issues found (with counts by severity)
     * Key recommendations
     * Summary of inline comments made
     * Overall assessment
   - This helps users see the complete review at a glance

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
  * Code suggestions when possible
  * Clear explanations of issues
  * Constructive criticism
  * Recognition of good practices

- Communication:
  * All feedback goes through GitHub's review system
  * Update your tracking comment with progress
  * Be professional and respectful

Before starting, analyze the PR inside <analysis> tags:
<analysis>
- PR title and description
- Number of files changed and scope
- Type of changes (feature, bug fix, refactor, etc.)
- Key areas to focus on
- Review strategy
</analysis>

Then proceed with the review workflow described above.

IMPORTANT: After submitting your review, always update the tracking comment with a detailed summary that includes:
- Total number of issues found by severity (Critical/Major/Minor)
- List of key issues with brief descriptions
- Main recommendations
- Overall code quality assessment
This ensures users can see the complete review summary without having to check each inline comment.`;
  },

  async prepare({
    context,
    octokit,
    githubToken,
  }: ModeOptions): Promise<ModeResult> {
    if (!isEntityContext(context)) {
      throw new Error("Review mode requires entity context");
    }

    const commentData = await createInitialComment(octokit.rest, context);
    const commentId = commentData.id;

    const githubData = await fetchGitHubData({
      octokits: octokit,
      repository: `${context.repository.owner}/${context.repository.repo}`,
      prNumber: context.entityNumber.toString(),
      isPR: context.isPR,
      triggerUsername: context.actor,
    });

    const branchInfo = await setupBranch(octokit, githubData, context);

    if (!context.inputs.useCommitSigning) {
      try {
        await configureGitAuth(githubToken, context, commentData.user);
      } catch (error) {
        console.error("Failed to configure git authentication:", error);
        throw error;
      }
    }

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
    const allowedTools = [
      ...baseTools,
      ...this.getAllowedTools(),
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
      claudeCommentId: commentId.toString(),
      allowedTools: [...this.getAllowedTools(), ...context.inputs.allowedTools],
      context,
    });

    core.setOutput("mcp_config", mcpConfig);

    return {
      commentId,
      branchInfo,
      mcpConfig,
    };
  },
};
