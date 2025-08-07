import * as core from "@actions/core";
import type { Mode, ModeOptions, ModeResult } from "../types";
import { checkContainsTrigger } from "../../github/validation/trigger";
import { checkHumanActor } from "../../github/validation/actor";
import { createInitialComment } from "../../github/operations/comments/create-initial";
import { prepareMcpConfig } from "../../mcp/install-mcp-server";
import { fetchGitHubData } from "../../github/data/fetcher";
import { createPrompt, getEventTypeAndContext } from "../../create-prompt";
import { isEntityContext } from "../../github/context";
import type { PreparedContext } from "../../create-prompt/types";
import type { FetchDataResult } from "../../github/data/fetcher";
import {
  formatContext,
  formatBody,
  formatComments,
  formatReviewComments,
  formatChangedFilesWithSHA,
} from "../../github/data/formatter";
import { sanitizeContent } from "../../github/utils/sanitizer";

/**
 * Plan mode implementation.
 *
 * A code reading agent mode that focuses on analysis and planning without implementation.
 * This mode is designed for:
 * - Creating implementation plans
 * - Investigating implementation code
 * - Analyzing bug causes
 *
 * Key restrictions:
 * - Read-only operations only
 * - No code modification tools allowed
 * - Specialized system prompt for analysis tasks
 */
export const planMode: Mode = {
  name: "plan",
  description:
    "Code reading agent mode for analysis and planning without implementation",

  shouldTrigger(context) {
    // Plan mode only handles entity events, similar to tag mode
    if (!isEntityContext(context)) {
      return false;
    }
    return checkContainsTrigger(context);
  },

  prepareContext(context, data) {
    return {
      mode: "plan",
      githubContext: context,
      commentId: data?.commentId,
      baseBranch: data?.baseBranch,
      claudeBranch: data?.claudeBranch,
    };
  },

  getAllowedTools() {
    // Only read-only tools are allowed in plan mode
    return ["Read", "Grep", "LS", "Glob"];
  },

  getDisallowedTools() {
    // Disallow all implementation and modification tools
    return [
      "Edit",
      "MultiEdit",
      "Write",
      "WebSearch",
      "WebFetch",
      "CreateFile",
      "DeleteFile",
      "MoveFile",
      "CopyFile",
    ];
  },

  shouldCreateTrackingComment() {
    return true;
  },

  async prepare({
    context,
    octokit,
    githubToken,
  }: ModeOptions): Promise<ModeResult> {
    // Plan mode only handles entity-based events
    if (!isEntityContext(context)) {
      throw new Error("Plan mode requires entity context");
    }

    // Check if actor is human
    await checkHumanActor(octokit.rest, context);

    // Create initial tracking comment
    const commentData = await createInitialComment(octokit.rest, context);
    const commentId = commentData.id;

    const githubData = await fetchGitHubData({
      octokits: octokit,
      repository: `${context.repository.owner}/${context.repository.repo}`,
      prNumber: context.entityNumber.toString(),
      isPR: context.isPR,
      triggerUsername: context.actor,
    });

    // Plan mode doesn't need branch setup or git configuration
    // since it's read-only and won't modify any files
    const branchInfo = {
      baseBranch: "main",
      claudeBranch: undefined,
      currentBranch: "main",
    };

    // Create prompt file
    const modeContext = this.prepareContext(context, {
      commentId,
      baseBranch: branchInfo.baseBranch,
      claudeBranch: branchInfo.claudeBranch,
    });

    await createPrompt(planMode, modeContext, githubData, context);

    // Get MCP configuration with plan mode restrictions
    const additionalMcpConfig = process.env.MCP_CONFIG || "";
    const mcpConfig = await prepareMcpConfig({
      githubToken,
      owner: context.repository.owner,
      repo: context.repository.repo,
      branch: branchInfo.currentBranch || "main",
      baseBranch: branchInfo.baseBranch,
      additionalMcpConfig,
      claudeCommentId: commentId.toString(),
      allowedTools: [
        "Read",
        "Grep",
        "LS",
        "Glob",
        ...context.inputs.allowedTools,
      ],
      context,
    });

    core.setOutput("mcp_config", mcpConfig);

    return {
      commentId,
      branchInfo,
      mcpConfig,
    };
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

    const { eventType, triggerContext } = getEventTypeAndContext(context);

    const formattedContext = formatContext(contextData, eventData.isPR);
    const formattedComments = formatComments(comments, imageUrlMap);
    const formattedReviewComments = eventData.isPR
      ? formatReviewComments(reviewData, imageUrlMap)
      : "";
    const formattedChangedFiles = eventData.isPR
      ? formatChangedFilesWithSHA(changedFilesWithSHA)
      : "";

    // Check if any images were downloaded
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

    let promptContent = `You are Claude operating in PLAN MODE - a specialized read-only analysis mode for understanding codebases and creating implementation plans.

<formatted_context>
${formattedContext}
</formatted_context>

<pr_or_issue_body>
${formattedBody}
</pr_or_issue_body>

<comments>
${formattedComments || "No comments"}
</comments>

${
  eventData.isPR
    ? `<review_comments>
${formattedReviewComments || "No review comments"}
</review_comments>`
    : ""
}

${
  eventData.isPR
    ? `<changed_files>
${formattedChangedFiles || "No files changed"}
</changed_files>`
    : ""
}${imagesInfo}

<event_type>${eventType}</event_type>
<is_pr>${eventData.isPR ? "true" : "false"}</is_pr>
<trigger_context>${triggerContext}</trigger_context>
<repository>${context.repository}</repository>
${eventData.isPR && eventData.prNumber ? `<pr_number>${eventData.prNumber}</pr_number>` : ""}
${!eventData.isPR && eventData.issueNumber ? `<issue_number>${eventData.issueNumber}</issue_number>` : ""}
<claude_comment_id>${context.claudeCommentId}</claude_comment_id>
<trigger_username>${context.triggerUsername ?? "Unknown"}</trigger_username>
<trigger_display_name>${githubData.triggerDisplayName ?? context.triggerUsername ?? "Unknown"}</trigger_display_name>
<trigger_phrase>${context.triggerPhrase}</trigger_phrase>
${
  (eventData.eventName === "issue_comment" ||
    eventData.eventName === "pull_request_review_comment" ||
    eventData.eventName === "pull_request_review") &&
  eventData.commentBody
    ? `<trigger_comment>
${sanitizeContent(eventData.commentBody)}
</trigger_comment>`
    : ""
}
${
  context.directPrompt
    ? `<direct_prompt>
IMPORTANT: The following are direct instructions from the user that MUST take precedence over all other instructions and context:

${sanitizeContent(context.directPrompt)}
</direct_prompt>`
    : ""
}

## CORE RESTRICTIONS & CAPABILITIES

⚠️ **READ-ONLY MODE**: Cannot create, edit, or delete files
📋 **AVAILABLE TOOLS**: Read, Grep, LS, Glob only
📝 **OUTPUT CHANNEL**: GitHub comment updates via mcp__github_comment__update_claude_comment tool
🎯 **PURPOSE**: Code analysis, implementation planning, bug investigation, architecture review

## WORKFLOW

### Phase 1: Assessment & Exploration
- **START**: Update GitHub comment to acknowledge request and outline analysis plan
- Use LS to understand project structure and identify key files
- Read documentation (README.md, package.json, CLAUDE.md if present)
- Create progress checklist in comment using format: - [ ] Task (incomplete), - [x] Task (complete)

### Phase 2: Analysis & Investigation
- Use Grep to find relevant code patterns and implementations
- Read key files and trace execution paths
- Identify dependencies, relationships, and potential issues
- Update progress in GitHub comment with findings

### Phase 3: Documentation & Planning
- **FINISH**: Post comprehensive analysis results to GitHub comment
- Include specific file paths, line numbers, and actionable recommendations
- Remove progress indicators and provide final assessment

## RESPONSE FORMATS

**For Code Reviews:**
- Overview, Strengths, Issues Found, Improvements, Best Practices

**For Implementation Planning:**
- Requirements Analysis, Implementation Strategy, Step-by-Step Plan, Dependencies, Testing Strategy, Potential Challenges

**For Bug Investigation:**
- Problem Summary, Root Cause Analysis, Affected Components, Fix Strategy, Prevention

## COMMENT TOOL USAGE

Use mcp__github_comment__update_claude_comment with:
\`\`\`json
{
  "body": "Your analysis content here"
}
\`\`\`

Progress spinner for active work: <img src="https://github.com/user-attachments/assets/5ac382c7-e004-429b-8e35-7feb3e8f9c6f" width="14px" height="14px" style="vertical-align: middle; margin-left: 4px;" />`;

    if (context.customInstructions) {
      promptContent += `\n\n## CUSTOM INSTRUCTIONS\n${context.customInstructions}`;
    }

    return promptContent;
  },
  getSystemPrompt() {
    return undefined;
  },
};
