import type { Mode, ModeOptions, ModeResult } from "../types";
import { checkHumanActor } from "../../github/validation/actor";
import { createInitialComment } from "../../github/operations/comments/create-initial";
import { setupBranch } from "../../github/operations/branch";
import { configureGitAuth } from "../../github/operations/git-config";
import { prepareMcpConfig } from "../../mcp/install-mcp-server";
import { fetchGitHubData } from "../../github/data/fetcher";
import { createPrompt } from "../../create-prompt";
import { generatePrReviewPrompt } from "../../create-prompt/pr-review-prompt";
import {
  isEntityContext,
  isPullRequestReviewRequestedEvent,
} from "../../github/context";
import type { PreparedContext } from "../../create-prompt/types";
import type { FetchDataResult } from "../../github/data/fetcher";

/**
 * PR Review mode implementation.
 *
 * This mode is specifically triggered when a review is requested on a pull request
 * and the reviewer matches the configured reviewer_trigger. It provides specialized
 * PR review functionality with optional custom prompt injection.
 */
export const prReviewMode: Mode = {
  name: "pr_review",
  description: "PR review mode triggered by review requests",

  shouldTrigger(context) {
    // Only handle entity events
    if (!isEntityContext(context)) {
      return false;
    }

    // Only trigger on pull_request review_requested events
    if (!isPullRequestReviewRequestedEvent(context)) {
      return false;
    }

    // Check if reviewer_trigger is configured
    const reviewerTrigger = context.inputs.reviewerTrigger;
    if (!reviewerTrigger) {
      return false;
    }

    // Check if the requested reviewer matches our trigger
    const triggerUser = reviewerTrigger.replace(/^@/, "");
    const requestedReviewerUsername =
      (context.payload as any).requested_reviewer?.login || "";

    if (!triggerUser || !requestedReviewerUsername) {
      return false;
    }

    const shouldTrigger = requestedReviewerUsername === triggerUser;

    if (shouldTrigger) {
      console.log(`PR review requested from trigger user '${triggerUser}'`);
    }

    return shouldTrigger;
  },

  prepareContext(context, data) {
    return {
      mode: "pr_review",
      githubContext: context,
      commentId: data?.commentId,
      baseBranch: data?.baseBranch,
      claudeBranch: data?.claudeBranch,
    };
  },

  getAllowedTools() {
    return [];
  },

  getDisallowedTools() {
    return [];
  },

  shouldCreateTrackingComment() {
    return true;
  },

  async prepare({
    context,
    octokit,
    githubToken,
  }: ModeOptions): Promise<ModeResult> {
    // PR review mode only handles entity-based events
    if (!isEntityContext(context)) {
      throw new Error("PR review mode requires entity context");
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

    // Setup branch - for PR reviews we typically work with the existing PR branch
    const branchInfo = await setupBranch(octokit, githubData, context);

    // Configure git authentication if not using commit signing
    if (!context.inputs.useCommitSigning) {
      try {
        await configureGitAuth(githubToken, context, commentData.user);
      } catch (error) {
        console.error("Failed to configure git authentication:", error);
        throw error;
      }
    }

    // Create prompt file
    const modeContext = this.prepareContext(context, {
      commentId,
      baseBranch: branchInfo.baseBranch,
      claudeBranch: branchInfo.claudeBranch,
    });

    await createPrompt(this, modeContext, githubData, context);

    // Get our GitHub MCP servers config
    const ourMcpConfig = await prepareMcpConfig({
      githubToken,
      owner: context.repository.owner,
      repo: context.repository.repo,
      branch: branchInfo.currentBranch,
      baseBranch: branchInfo.baseBranch,
      claudeCommentId: commentId.toString(),
      allowedTools: [],
      context,
    });

    return {
      commentId,
      branchInfo: branchInfo,
      mcpConfig: ourMcpConfig,
    };
  },

  generatePrompt(
    context: PreparedContext,
    githubData: FetchDataResult,
    useCommitSigning: boolean = false,
    allowPrReviews: boolean = false,
  ): string {
    return generatePrReviewPrompt(
      context,
      githubData,
      useCommitSigning,
      allowPrReviews,
      context.prompt, // Custom prompt injection
    );
  },

  getSystemPrompt() {
    // PR review mode doesn't need additional system prompts
    return undefined;
  },
};
