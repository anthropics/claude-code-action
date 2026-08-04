import { execFileSync } from "child_process";
import type { IssuesEvent } from "@octokit/webhooks-types";
import type { Octokits } from "../api/client";
import { ISSUE_QUERY, PR_QUERY, USER_QUERY } from "../api/queries/github";
import {
  isIssueCommentEvent,
  isIssuesEvent,
  isPullRequestEvent,
  isPullRequestReviewEvent,
  isPullRequestReviewCommentEvent,
  type ParsedGitHubContext,
} from "../context";
import type {
  GitHubComment,
  GitHubFile,
  GitHubIssue,
  GitHubPullRequest,
  GitHubReview,
  IssueQueryResponse,
  PullRequestQueryResponse,
} from "../types";
import type { CommentWithImages } from "../utils/image-downloader";
import { downloadCommentImages } from "../utils/image-downloader";
import {
  parseActorFilter,
  shouldIncludeCommentByActor,
} from "../utils/actor-filter";

/**
 * Extracts the trigger timestamp from the GitHub webhook payload.
 * This timestamp represents when the triggering comment/review/event was created.
 *
 * For `issues` and `pull_request` events there is no dedicated trigger
 * object in the payload, so the issue/PR's own timestamps from the webhook
 * snapshot are used: `created_at` for opened events, otherwise `updated_at`
 * (falling back to `created_at`). For issues labeled/assigned events,
 * prefer resolveTriggerTimestamp() which looks up the exact event time.
 *
 * @param context - Parsed GitHub context from webhook
 * @returns ISO timestamp string or undefined if not available
 */
export function extractTriggerTimestamp(
  context: ParsedGitHubContext,
): string | undefined {
  if (isIssueCommentEvent(context)) {
    return context.payload.comment.created_at || undefined;
  } else if (isPullRequestReviewEvent(context)) {
    return context.payload.review.submitted_at || undefined;
  } else if (isPullRequestReviewCommentEvent(context)) {
    return context.payload.comment.created_at || undefined;
  } else if (isIssuesEvent(context)) {
    const issue = context.payload.issue;
    if (context.eventAction === "opened") {
      return issue?.created_at || issue?.updated_at || undefined;
    }
    // updated_at reflects the last comment or edit on the issue, so the
    // newest pre-existing comment can share this timestamp and be excluded
    // along with anything newer.
    return issue?.updated_at || issue?.created_at || undefined;
  } else if (isPullRequestEvent(context)) {
    const pullRequest = context.payload.pull_request;
    if (context.eventAction === "opened") {
      return pullRequest?.created_at || pullRequest?.updated_at || undefined;
    }
    return pullRequest?.updated_at || pullRequest?.created_at || undefined;
  }

  return undefined;
}

/**
 * Resolves the trigger timestamp for the event, consulting the GitHub API
 * where the webhook payload does not carry an exact time for the triggering
 * action.
 *
 * For issues labeled/assigned events the label/assignment carries no
 * timestamp of its own in the payload, so the matching entry in the issue's
 * event history is looked up and its `created_at` is used. If the lookup
 * fails, this falls back to extractTriggerTimestamp().
 *
 * @param context - Parsed GitHub context from webhook
 * @param octokits - GitHub API clients
 * @returns ISO timestamp string or undefined if not available
 */
export async function resolveTriggerTimestamp(
  context: ParsedGitHubContext,
  octokits: Octokits,
): Promise<string | undefined> {
  if (
    isIssuesEvent(context) &&
    (context.eventAction === "labeled" || context.eventAction === "assigned")
  ) {
    const eventTime = await findIssueEventTime(context, octokits);
    if (eventTime) {
      return eventTime;
    }
    console.warn(
      `Could not resolve the ${context.eventAction} event time for issue #${context.entityNumber}; falling back to the webhook payload timestamps`,
    );
  }

  return extractTriggerTimestamp(context);
}

/**
 * Looks up the most recent labeled/assigned event on the issue that matches
 * the label or assignee in the webhook payload, returning its created_at.
 */
async function findIssueEventTime(
  context: ParsedGitHubContext & { payload: IssuesEvent },
  octokits: Octokits,
): Promise<string | undefined> {
  const payload = context.payload;
  let matches: (event: {
    event: string;
    label?: { name?: string | null };
    assignee?: { login?: string } | null;
  }) => boolean;

  if (payload.action === "labeled") {
    const labelName = payload.label?.name;
    if (!labelName) return undefined;
    matches = (event) =>
      event.event === "labeled" && event.label?.name === labelName;
  } else if (payload.action === "assigned") {
    const assigneeLogin = payload.assignee?.login;
    if (!assigneeLogin) return undefined;
    matches = (event) =>
      event.event === "assigned" && event.assignee?.login === assigneeLogin;
  } else {
    return undefined;
  }

  try {
    const events = await octokits.rest.paginate(
      octokits.rest.issues.listEvents,
      {
        owner: context.repository.owner,
        repo: context.repository.repo,
        issue_number: context.entityNumber,
        per_page: 100,
      },
    );

    let latest: (typeof events)[number] | undefined;
    for (const event of events.filter(matches)) {
      if (
        !latest ||
        new Date(event.created_at).getTime() >
          new Date(latest.created_at).getTime()
      ) {
        latest = event;
      }
    }

    // Labeling/assignment does not bump the issue's updated_at, so the event
    // that fired this webhook cannot predate the payload snapshot's
    // updated_at. An older match means the current event is not visible in
    // the events API yet; ignore it rather than adopt a stale boundary.
    const snapshotUpdatedAt = payload.issue?.updated_at;
    if (
      latest &&
      snapshotUpdatedAt &&
      new Date(latest.created_at).getTime() <
        new Date(snapshotUpdatedAt).getTime()
    ) {
      console.warn(
        `Latest matching ${payload.action} event on issue #${context.entityNumber} predates the issue's updated_at; treating it as stale`,
      );
      return undefined;
    }

    return latest?.created_at || undefined;
  } catch (error) {
    console.warn(
      `Failed to fetch events for issue #${context.entityNumber}:`,
      error,
    );
    return undefined;
  }
}

/**
 * Extracts the original title from the GitHub webhook payload.
 * This is the title as it existed when the trigger event occurred.
 *
 * @param context - Parsed GitHub context from webhook
 * @returns The original title string or undefined if not available
 */
export function extractOriginalTitle(
  context: ParsedGitHubContext,
): string | undefined {
  if (isIssueCommentEvent(context)) {
    return context.payload.issue?.title;
  } else if (isPullRequestEvent(context)) {
    return context.payload.pull_request?.title;
  } else if (isPullRequestReviewEvent(context)) {
    return context.payload.pull_request?.title;
  } else if (isPullRequestReviewCommentEvent(context)) {
    return context.payload.pull_request?.title;
  } else if (isIssuesEvent(context)) {
    return context.payload.issue?.title;
  }

  return undefined;
}

/**
 * Extracts the original body from the GitHub webhook payload.
 * This is the body as it existed when the trigger event occurred,
 * preventing TOCTOU attacks where an attacker edits the body after
 * the trigger but before the action reads it.
 *
 * @param context - Parsed GitHub context from webhook
 * @returns The original body string, null (no body), or undefined (not available)
 */
export function extractOriginalBody(
  context: ParsedGitHubContext,
): string | null | undefined {
  if (isIssueCommentEvent(context)) {
    return context.payload.issue?.body;
  } else if (isPullRequestEvent(context)) {
    return context.payload.pull_request?.body;
  } else if (isPullRequestReviewEvent(context)) {
    return context.payload.pull_request?.body;
  } else if (isPullRequestReviewCommentEvent(context)) {
    return context.payload.pull_request?.body;
  } else if (isIssuesEvent(context)) {
    return context.payload.issue?.body;
  }

  return undefined;
}

/**
 * Filters comments to only include those that existed in their final state before the trigger time.
 * This prevents malicious actors from editing comments after the trigger to inject harmful content.
 *
 * @param comments - Array of GitHub comments to filter
 * @param triggerTime - ISO timestamp of when the trigger comment was created
 * @returns Filtered array of comments that were created and last edited before trigger time
 */
export function filterCommentsToTriggerTime<
  T extends { createdAt: string; updatedAt?: string; lastEditedAt?: string },
>(comments: T[], triggerTime: string | undefined): T[] {
  if (!triggerTime) return comments;

  const triggerTimestamp = new Date(triggerTime).getTime();

  return comments.filter((comment) => {
    // Comment must have been created before trigger (not at or after)
    const createdTimestamp = new Date(comment.createdAt).getTime();
    if (createdTimestamp >= triggerTimestamp) {
      return false;
    }

    // If comment has been edited, the most recent edit must have occurred before trigger
    // Use lastEditedAt if available, otherwise fall back to updatedAt
    const lastEditTime = comment.lastEditedAt || comment.updatedAt;
    if (lastEditTime) {
      const lastEditTimestamp = new Date(lastEditTime).getTime();
      if (lastEditTimestamp >= triggerTimestamp) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Filters reviews to only include those that existed in their final state before the trigger time.
 * Similar to filterCommentsToTriggerTime but for GitHubReview objects which use submittedAt instead of createdAt.
 */
export function filterReviewsToTriggerTime<
  T extends { submittedAt: string; updatedAt?: string; lastEditedAt?: string },
>(reviews: T[], triggerTime: string | undefined): T[] {
  if (!triggerTime) return reviews;

  const triggerTimestamp = new Date(triggerTime).getTime();

  return reviews.filter((review) => {
    // Review must have been submitted before trigger (not at or after)
    const submittedTimestamp = new Date(review.submittedAt).getTime();
    if (submittedTimestamp >= triggerTimestamp) {
      return false;
    }

    // If review has been edited, the most recent edit must have occurred before trigger
    const lastEditTime = review.lastEditedAt || review.updatedAt;
    if (lastEditTime) {
      const lastEditTimestamp = new Date(lastEditTime).getTime();
      if (lastEditTimestamp >= triggerTimestamp) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Checks if the issue/PR body was edited after the trigger time.
 * This prevents a race condition where an attacker could edit the issue/PR body
 * between when an authorized user triggered Claude and when Claude processes the request.
 *
 * @param contextData - The PR or issue data containing body and edit timestamps
 * @param triggerTime - ISO timestamp of when the trigger event occurred
 * @returns true if the body is safe to use, false if it was edited after trigger
 */
export function isBodySafeToUse(
  contextData: { createdAt: string; updatedAt?: string; lastEditedAt?: string },
  triggerTime: string | undefined,
): boolean {
  // If no trigger time is available, we can't validate - allow the body
  // This maintains backwards compatibility for triggers that don't have timestamps
  if (!triggerTime) return true;

  const triggerTimestamp = new Date(triggerTime).getTime();

  // Check if the body was edited after the trigger
  // Use lastEditedAt if available (more accurate for body edits), otherwise fall back to updatedAt
  const lastEditTime = contextData.lastEditedAt || contextData.updatedAt;
  if (lastEditTime) {
    const lastEditTimestamp = new Date(lastEditTime).getTime();
    if (lastEditTimestamp >= triggerTimestamp) {
      return false;
    }
  }

  return true;
}

/**
 * Filters comments by actor username based on include/exclude patterns
 * @param comments - Array of comments to filter
 * @param includeActors - Comma-separated actors to include
 * @param excludeActors - Comma-separated actors to exclude
 * @returns Filtered array of comments
 */
export function filterCommentsByActor<
  T extends { author: { login: string } | null },
>(comments: T[], includeActors: string = "", excludeActors: string = ""): T[] {
  const includeParsed = parseActorFilter(includeActors);
  const excludeParsed = parseActorFilter(excludeActors);

  // No filters = return all
  if (includeParsed.length === 0 && excludeParsed.length === 0) {
    return comments;
  }

  return comments.filter((comment) =>
    shouldIncludeCommentByActor(
      // author is null for comments from deleted ("ghost") accounts; treat them
      // as the "ghost" login so filtering never dereferences null and crashes.
      comment.author?.login ?? "ghost",
      includeParsed,
      excludeParsed,
    ),
  );
}

type FetchDataParams = {
  octokits: Octokits;
  repository: string;
  prNumber: string;
  isPR: boolean;
  triggerUsername?: string;
  triggerTime?: string;
  originalTitle?: string;
  originalBody?: string | null;
  includeCommentsByActor?: string;
  excludeCommentsByActor?: string;
};

export type GitHubFileWithSHA = GitHubFile & {
  sha: string;
};

export type FetchDataResult = {
  contextData: GitHubPullRequest | GitHubIssue;
  comments: GitHubComment[];
  changedFiles: GitHubFile[];
  changedFilesWithSHA: GitHubFileWithSHA[];
  reviewData: { nodes: GitHubReview[] } | null;
  imageUrlMap: Map<string, string>;
  triggerDisplayName?: string | null;
};

export async function fetchGitHubData({
  octokits,
  repository,
  prNumber,
  isPR,
  triggerUsername,
  triggerTime,
  originalTitle,
  originalBody,
  includeCommentsByActor,
  excludeCommentsByActor,
}: FetchDataParams): Promise<FetchDataResult> {
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    throw new Error("Invalid repository format. Expected 'owner/repo'.");
  }

  let contextData: GitHubPullRequest | GitHubIssue | null = null;
  let comments: GitHubComment[] = [];
  let changedFiles: GitHubFile[] = [];
  let reviewData: { nodes: GitHubReview[] } | null = null;

  try {
    if (isPR) {
      // Fetch PR data with all comments and file information
      const prResult = await octokits.graphql<PullRequestQueryResponse>(
        PR_QUERY,
        {
          owner,
          repo,
          number: parseInt(prNumber),
        },
      );

      if (prResult.repository.pullRequest) {
        const pullRequest = prResult.repository.pullRequest;
        contextData = pullRequest;
        if (pullRequest.files === null) {
          console.warn(
            `GitHub did not return the file list for PR #${prNumber} (diff likely too large); proceeding without file-level context`,
          );
        }
        changedFiles = pullRequest.files?.nodes ?? [];
        comments = filterCommentsByActor(
          filterCommentsToTriggerTime(
            pullRequest.comments?.nodes || [],
            triggerTime,
          ),
          includeCommentsByActor,
          excludeCommentsByActor,
        );
        reviewData = pullRequest.reviews || { nodes: [] };

        console.log(`Successfully fetched PR #${prNumber} data`);
      } else {
        throw new Error(`PR #${prNumber} not found`);
      }
    } else {
      // Fetch issue data
      const issueResult = await octokits.graphql<IssueQueryResponse>(
        ISSUE_QUERY,
        {
          owner,
          repo,
          number: parseInt(prNumber),
        },
      );

      if (issueResult.repository.issue) {
        contextData = issueResult.repository.issue;
        comments = filterCommentsByActor(
          filterCommentsToTriggerTime(
            contextData?.comments?.nodes || [],
            triggerTime,
          ),
          includeCommentsByActor,
          excludeCommentsByActor,
        );

        console.log(`Successfully fetched issue #${prNumber} data`);
      } else {
        throw new Error(`Issue #${prNumber} not found`);
      }
    }
  } catch (error) {
    console.error(`Failed to fetch ${isPR ? "PR" : "issue"} data:`, error);
    throw new Error(`Failed to fetch ${isPR ? "PR" : "issue"} data`);
  }

  // Compute SHAs for changed files
  let changedFilesWithSHA: GitHubFileWithSHA[] = [];
  if (isPR && changedFiles.length > 0) {
    changedFilesWithSHA = changedFiles.map((file) => {
      // Don't compute SHA for deleted files
      if (file.changeType === "DELETED") {
        return {
          ...file,
          sha: "deleted",
        };
      }

      try {
        // Use git hash-object to compute the SHA for the current file content
        const sha = execFileSync("git", ["hash-object", file.path], {
          encoding: "utf-8",
        }).trim();
        return {
          ...file,
          sha,
        };
      } catch (error) {
        console.warn(`Failed to compute SHA for ${file.path}:`, error);
        // Return original file without SHA if computation fails
        return {
          ...file,
          sha: "unknown",
        };
      }
    });
  }

  // Prepare all comments for image processing
  const issueComments: CommentWithImages[] = comments
    .filter((c) => c.body && !c.isMinimized)
    .map((c) => ({
      type: "issue_comment" as const,
      id: c.databaseId,
      body: c.body,
    }));

  // Filter reviews and inline review comments to trigger time and by actor
  // before building anything from them. The trigger-time filter is the TOCTOU
  // protection applied to issue/PR comments and the body above: it drops
  // anything submitted, created, or edited at/after the trigger so an attacker
  // cannot inject content into the prompt after an authorized trigger. Without
  // it, review bodies and inline review comments would reach the prompt
  // verbatim regardless of when they landed.
  if (reviewData && reviewData.nodes) {
    // Drop reviews submitted or edited after the trigger, then filter by actor.
    reviewData.nodes = filterCommentsByActor(
      filterReviewsToTriggerTime(reviewData.nodes, triggerTime),
      includeCommentsByActor,
      excludeCommentsByActor,
    );

    // Apply the same trigger-time + actor filtering to inline review comments.
    reviewData.nodes.forEach((review) => {
      if (review.comments?.nodes) {
        review.comments.nodes = filterCommentsByActor(
          filterCommentsToTriggerTime(review.comments.nodes, triggerTime),
          includeCommentsByActor,
          excludeCommentsByActor,
        );
      }
    });
  }

  // Build the image-processing lists from the already-filtered review nodes,
  // so reviews/comments excluded from the prompt are not processed for images.
  const reviewBodies: CommentWithImages[] = (reviewData?.nodes ?? [])
    .filter((r) => r.body)
    .map((r) => ({
      type: "review_body" as const,
      id: r.databaseId,
      pullNumber: prNumber,
      body: r.body,
    }));

  const reviewComments: CommentWithImages[] = (reviewData?.nodes ?? [])
    .flatMap((r) => r.comments?.nodes ?? [])
    .filter((c) => c.body && !c.isMinimized)
    .map((c) => ({
      type: "review_comment" as const,
      id: c.databaseId,
      body: c.body,
    }));

  // Use the original body from the webhook payload if provided (TOCTOU protection).
  // The webhook payload captures the body at event time, before any attacker edits.
  if (originalBody !== undefined) {
    contextData.body = originalBody ?? "";
  }

  // Add the main issue/PR body if it has content and wasn't edited after trigger.
  // When originalBody is provided, the body is already safe (from webhook payload).
  // Otherwise, fall back to timestamp-based validation.
  let mainBody: CommentWithImages[] = [];
  if (contextData.body) {
    if (
      originalBody !== undefined ||
      isBodySafeToUse(contextData, triggerTime)
    ) {
      mainBody = [
        {
          ...(isPR
            ? {
                type: "pr_body" as const,
                pullNumber: prNumber,
                body: contextData.body,
              }
            : {
                type: "issue_body" as const,
                issueNumber: prNumber,
                body: contextData.body,
              }),
        },
      ];
    } else {
      console.warn(
        `Security: ${isPR ? "PR" : "Issue"} #${prNumber} body was edited after the trigger event. ` +
          `Excluding body content to prevent potential injection attacks.`,
      );
    }
  }

  const allComments = [
    ...mainBody,
    ...issueComments,
    ...reviewBodies,
    ...reviewComments,
  ];

  const imageUrlMap = await downloadCommentImages(
    octokits,
    owner,
    repo,
    allComments,
  );

  // Fetch trigger user display name if username is provided
  let triggerDisplayName: string | null | undefined;
  if (triggerUsername) {
    triggerDisplayName = await fetchUserDisplayName(octokits, triggerUsername);
  }

  // Use the original title from the webhook payload if provided
  if (originalTitle !== undefined) {
    contextData.title = originalTitle;
  }

  return {
    contextData,
    comments,
    changedFiles,
    changedFilesWithSHA,
    reviewData,
    imageUrlMap,
    triggerDisplayName,
  };
}

export type UserQueryResponse = {
  user: {
    name: string | null;
  };
};

export async function fetchUserDisplayName(
  octokits: Octokits,
  login: string,
): Promise<string | null> {
  try {
    const result = await octokits.graphql<UserQueryResponse>(USER_QUERY, {
      login,
    });
    return result.user.name;
  } catch (error) {
    console.warn(`Failed to fetch user display name for ${login}:`, error);
    return null;
  }
}
