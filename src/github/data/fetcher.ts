import { execSync } from "child_process";
import type { Octokits } from "../api/client";
import {
  USER_QUERY,
  createPRQuery,
  createIssueQuery,
  type PaginationConfig,
} from "../api/queries/github";
import type {
  GitHubComment,
  GitHubFile,
  GitHubIssue,
  GitHubPullRequest,
  GitHubReview,
  IssueQueryResponse,
  PullRequestQueryResponse,
  PageInfo,
} from "../types";
import type { CommentWithImages } from "../utils/image-downloader";
import { downloadCommentImages } from "../utils/image-downloader";

type FetchDataParams = {
  octokits: Octokits;
  repository: string;
  prNumber: string;
  isPR: boolean;
  triggerUsername?: string;
  paginationConfig?: PaginationConfig;
};

export type GitHubFileWithSHA = GitHubFile & {
  sha: string;
};

export type FetchDataResult = {
  contextData: GitHubPullRequest | GitHubIssue;
  comments: GitHubComment[];
  changedFiles: GitHubFile[];
  changedFilesWithSHA: GitHubFileWithSHA[];
  reviewData: { pageInfo: PageInfo; nodes: GitHubReview[] } | null;
  imageUrlMap: Map<string, string>;
  triggerDisplayName?: string | null;
};

// Helper function to get pagination config from environment variables
export function getPaginationConfigFromEnv(): PaginationConfig {
  const maxFiles = parseInt(process.env.MAX_FILES || "100");
  const maxCommits = parseInt(process.env.MAX_COMMITS || "100");
  const maxComments = parseInt(process.env.MAX_COMMENTS || "100");
  const maxReviews = parseInt(process.env.MAX_REVIEWS || "100");

  return {
    // 0 means unlimited (very large number)
    maxFiles: maxFiles === 0 ? Number.MAX_SAFE_INTEGER : maxFiles,
    maxCommits: maxCommits === 0 ? Number.MAX_SAFE_INTEGER : maxCommits,
    maxComments: maxComments === 0 ? Number.MAX_SAFE_INTEGER : maxComments,
    maxReviews: maxReviews === 0 ? Number.MAX_SAFE_INTEGER : maxReviews,
  };
}

// Helper function to fetch all pages of data for PR
async function fetchAllPRData(
  octokits: Octokits,
  owner: string,
  repo: string,
  prNumber: number,
  config: PaginationConfig,
): Promise<GitHubPullRequest> {
  let result: GitHubPullRequest | null = null;
  let allCommits: Array<{ commit: any }> = [];
  let allFiles: GitHubFile[] = [];
  let allComments: GitHubComment[] = [];
  let allReviews: GitHubReview[] = [];

  // Track cursors for pagination
  let commitsCursor: string | null = null;
  let filesCursor: string | null = null;
  let commentsCursor: string | null = null;
  let reviewsCursor: string | null = null;

  let hasMoreData = true;
  let fetchCount = 0;
  const maxFetches = 50; // Safety limit to prevent infinite loops

  while (hasMoreData && fetchCount < maxFetches) {
    const query = createPRQuery(config, {
      commitsCursor: commitsCursor || undefined,
      filesCursor: filesCursor || undefined,
      commentsCursor: commentsCursor || undefined,
      reviewsCursor: reviewsCursor || undefined,
    });

    console.log(`Fetching PR data page ${fetchCount + 1}`);

    const pageResult = await octokits.graphql<PullRequestQueryResponse>(query, {
      owner,
      repo,
      number: prNumber,
    });

    if (!pageResult.repository.pullRequest) {
      throw new Error(`PR #${prNumber} not found`);
    }

    const pr = pageResult.repository.pullRequest;

    // Store base data from first fetch
    if (!result) {
      result = {
        ...pr,
        commits: {
          totalCount: pr.commits.totalCount,
          pageInfo: pr.commits.pageInfo,
          nodes: [],
        },
        files: { pageInfo: pr.files.pageInfo, nodes: [] },
        comments: { pageInfo: pr.comments.pageInfo, nodes: [] },
        reviews: { pageInfo: pr.reviews.pageInfo, nodes: [] },
      };
    }

    // Accumulate data
    allCommits.push(...pr.commits.nodes);
    allFiles.push(...pr.files.nodes);
    allComments.push(...pr.comments.nodes);
    allReviews.push(...pr.reviews.nodes);

    // Check if we have more data to fetch (only if we need pagination and haven't hit limits)
    const needsPagination =
      config.maxFiles > 100 ||
      config.maxCommits > 100 ||
      config.maxComments > 100 ||
      config.maxReviews > 100;

    const needMoreCommits =
      needsPagination &&
      pr.commits.pageInfo.hasNextPage &&
      allCommits.length < config.maxCommits;
    const needMoreFiles =
      needsPagination &&
      pr.files.pageInfo.hasNextPage &&
      allFiles.length < config.maxFiles;
    const needMoreComments =
      needsPagination &&
      pr.comments.pageInfo.hasNextPage &&
      allComments.length < config.maxComments;
    const needMoreReviews =
      needsPagination &&
      pr.reviews.pageInfo.hasNextPage &&
      allReviews.length < config.maxReviews;

    hasMoreData =
      needMoreCommits || needMoreFiles || needMoreComments || needMoreReviews;

    // Update cursors for next iteration
    if (needMoreCommits) commitsCursor = pr.commits.pageInfo.endCursor;
    if (needMoreFiles) filesCursor = pr.files.pageInfo.endCursor;
    if (needMoreComments) commentsCursor = pr.comments.pageInfo.endCursor;
    if (needMoreReviews) reviewsCursor = pr.reviews.pageInfo.endCursor;

    fetchCount++;
  }

  if (fetchCount >= maxFetches) {
    console.warn(
      `Reached maximum fetch limit (${maxFetches}) for PR #${prNumber}. Some data may be truncated.`,
    );
  }

  // Log pagination results when pagination was used
  const needsPagination =
    config.maxFiles > 100 ||
    config.maxCommits > 100 ||
    config.maxComments > 100 ||
    config.maxReviews > 100;

  if (needsPagination) {
    console.log(`Pagination results for PR #${prNumber}:`);
    console.log(
      `- Commits: ${allCommits.length}${result?.commits.totalCount ? ` / ${result.commits.totalCount}` : ""}`,
    );
    console.log(`- Files: ${allFiles.length}`);
    console.log(`- Comments: ${allComments.length}`);
    console.log(`- Reviews: ${allReviews.length}`);
  }

  // Apply limits and warn about truncation
  const finalCommits = allCommits.slice(0, config.maxCommits);
  const finalFiles = allFiles.slice(0, config.maxFiles);
  const finalComments = allComments.slice(0, config.maxComments);
  const finalReviews = allReviews.slice(0, config.maxReviews);

  // Warn about truncation
  if (allCommits.length > config.maxCommits) {
    console.warn(
      `⚠️  PR analysis truncated: Only analyzing first ${config.maxCommits} of ${allCommits.length} commits`,
    );
  }
  if (allFiles.length > config.maxFiles) {
    console.warn(
      `⚠️  PR analysis truncated: Only analyzing first ${config.maxFiles} of ${allFiles.length} files`,
    );
  }
  if (allComments.length > config.maxComments) {
    console.warn(
      `⚠️  PR analysis truncated: Only analyzing first ${config.maxComments} of ${allComments.length} comments`,
    );
  }
  if (allReviews.length > config.maxReviews) {
    console.warn(
      `⚠️  PR analysis truncated: Only analyzing first ${config.maxReviews} of ${allReviews.length} reviews`,
    );
  }

  return {
    ...result!,
    commits: { ...result!.commits, nodes: finalCommits },
    files: { ...result!.files, nodes: finalFiles },
    comments: { ...result!.comments, nodes: finalComments },
    reviews: { ...result!.reviews, nodes: finalReviews },
  };
}

// Helper function to fetch all pages of data for Issue
async function fetchAllIssueData(
  octokits: Octokits,
  owner: string,
  repo: string,
  issueNumber: number,
  config: PaginationConfig,
): Promise<GitHubIssue> {
  let result: GitHubIssue | null = null;
  let allComments: GitHubComment[] = [];
  let commentsCursor: string | null = null;
  let hasMoreData = true;
  let fetchCount = 0;
  const maxFetches = 50;

  while (hasMoreData && fetchCount < maxFetches) {
    const query = createIssueQuery(config, commentsCursor || undefined);

    console.log(`Fetching issue data page ${fetchCount + 1}`);

    const pageResult = await octokits.graphql<IssueQueryResponse>(query, {
      owner,
      repo,
      number: issueNumber,
    });

    if (!pageResult.repository.issue) {
      throw new Error(`Issue #${issueNumber} not found`);
    }

    const issue = pageResult.repository.issue;

    if (!result) {
      result = {
        ...issue,
        comments: { pageInfo: issue.comments.pageInfo, nodes: [] },
      };
    }

    allComments.push(...issue.comments.nodes);

    const needsPagination = config.maxComments > 100;
    const needMoreComments =
      needsPagination &&
      issue.comments.pageInfo.hasNextPage &&
      allComments.length < config.maxComments;
    hasMoreData = needMoreComments;

    if (needMoreComments) {
      commentsCursor = issue.comments.pageInfo.endCursor;
    }

    fetchCount++;
  }

  if (fetchCount >= maxFetches) {
    console.warn(
      `Reached maximum fetch limit (${maxFetches}) for issue #${issueNumber}. Some data may be truncated.`,
    );
  }

  const finalComments = allComments.slice(0, config.maxComments);

  if (allComments.length > config.maxComments) {
    console.warn(
      `⚠️  Issue analysis truncated: Only analyzing first ${config.maxComments} of ${allComments.length} comments`,
    );
  }

  return {
    ...result!,
    comments: { ...result!.comments, nodes: finalComments },
  };
}

export async function fetchGitHubData({
  octokits,
  repository,
  prNumber,
  isPR,
  triggerUsername,
  paginationConfig,
}: FetchDataParams): Promise<FetchDataResult> {
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    throw new Error("Invalid repository format. Expected 'owner/repo'.");
  }

  // Use provided config or get from environment
  const config = paginationConfig || getPaginationConfigFromEnv();

  let contextData: GitHubPullRequest | GitHubIssue | null = null;
  let comments: GitHubComment[] = [];
  let changedFiles: GitHubFile[] = [];
  let reviewData: { pageInfo: PageInfo; nodes: GitHubReview[] } | null = null;

  try {
    if (isPR) {
      // Fetch PR data with pagination support
      const pullRequest = await fetchAllPRData(
        octokits,
        owner,
        repo,
        parseInt(prNumber),
        config,
      );

      contextData = pullRequest;
      changedFiles = pullRequest.files.nodes || [];
      comments = pullRequest.comments?.nodes || [];
      reviewData = pullRequest.reviews || [];

      console.log(`Successfully fetched PR #${prNumber} data with pagination`);
    } else {
      // Fetch issue data with pagination support
      const issue = await fetchAllIssueData(
        octokits,
        owner,
        repo,
        parseInt(prNumber),
        config,
      );

      contextData = issue;
      comments = contextData?.comments?.nodes || [];

      console.log(
        `Successfully fetched issue #${prNumber} data with pagination`,
      );
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
        const sha = execSync(`git hash-object "${file.path}"`, {
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
    .filter((c) => c.body)
    .map((c) => ({
      type: "issue_comment" as const,
      id: c.databaseId,
      body: c.body,
    }));

  const reviewBodies: CommentWithImages[] =
    reviewData?.nodes
      ?.filter((r) => r.body)
      .map((r) => ({
        type: "review_body" as const,
        id: r.databaseId,
        pullNumber: prNumber,
        body: r.body,
      })) ?? [];

  const reviewComments: CommentWithImages[] =
    reviewData?.nodes
      ?.flatMap((r) => r.comments?.nodes ?? [])
      .filter((c) => c.body)
      .map((c) => ({
        type: "review_comment" as const,
        id: c.databaseId,
        body: c.body,
      })) ?? [];

  // Add the main issue/PR body if it has content
  const mainBody: CommentWithImages[] = contextData.body
    ? [
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
      ]
    : [];

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
