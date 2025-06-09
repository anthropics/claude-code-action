import { execSync } from "child_process";
import type { Octokits } from "../api/client";
import { ISSUE_QUERY, PR_QUERY } from "../api/queries/github";
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

type FetchDataParams = {
  octokits: Octokits;
  repository: string;
  prNumber: string;
  isPR: boolean;
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
};

export async function fetchGitHubData({
  octokits,
  repository,
  prNumber,
  isPR,
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
        changedFiles = pullRequest.files.nodes || [];
        comments = pullRequest.comments?.nodes || [];
        reviewData = pullRequest.reviews || [];

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
        comments = contextData?.comments?.nodes || [];

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

  return {
    contextData,
    comments,
    changedFiles,
    changedFilesWithSHA,
    reviewData,
    imageUrlMap,
  };
}
