import type {
  GitHubPullRequest,
  GitHubIssue,
  GitHubComment,
  GitHubFile,
  GitHubReview,
} from "../types";
import type { GitHubFileWithSHA } from "./fetcher";
import { sanitizeContent } from "../utils/sanitizer";

const REVIEW_DIFF_HUNK_CONTEXT_LINES = 20;
const MAX_REVIEW_DIFF_HUNK_CHARS = 4_000;
const MAX_REVIEW_DIFF_CONTEXT_CHARS = 50_000;

function formatLabels(labelNodes: Array<{ name: string }>): string {
  if (labelNodes.length === 0) return "none";
  return labelNodes.map((l) => l.name).join(", ");
}

export function formatContext(
  contextData: GitHubPullRequest | GitHubIssue,
  isPR: boolean,
): string {
  if (isPR) {
    const prData = contextData as GitHubPullRequest;
    const sanitizedTitle = sanitizeContent(prData.title);
    return `PR Title: ${sanitizedTitle}
PR Author: ${prData.author?.login ?? "ghost"}
PR Branch: ${prData.headRefName} -> ${prData.baseRefName}
PR State: ${prData.state}
PR Labels: ${formatLabels(prData.labels.nodes)}
PR Additions: ${prData.additions}
PR Deletions: ${prData.deletions}
Total Commits: ${prData.commits.totalCount}
Changed Files: ${prData.files ? `${prData.files.nodes.length} files` : "unknown (file list unavailable)"}`;
  } else {
    const issueData = contextData as GitHubIssue;
    const sanitizedTitle = sanitizeContent(issueData.title);
    return `Issue Title: ${sanitizedTitle}
Issue Author: ${issueData.author?.login ?? "ghost"}
Issue State: ${issueData.state}
Issue Labels: ${formatLabels(issueData.labels.nodes)}`;
  }
}

export function formatBody(
  body: string,
  imageUrlMap: Map<string, string>,
): string {
  let processedBody = body;

  for (const [originalUrl, localPath] of imageUrlMap) {
    processedBody = processedBody.replaceAll(originalUrl, localPath);
  }

  processedBody = sanitizeContent(processedBody);

  return processedBody;
}

export function formatComments(
  comments: GitHubComment[],
  imageUrlMap?: Map<string, string>,
): string {
  return comments
    .filter((comment) => !comment.isMinimized)
    .map((comment) => {
      let body = comment.body;

      if (imageUrlMap && body) {
        for (const [originalUrl, localPath] of imageUrlMap) {
          body = body.replaceAll(originalUrl, localPath);
        }
      }

      body = sanitizeContent(body);

      return `[${comment.author?.login ?? "ghost"} at ${comment.createdAt}]: ${body}`;
    })
    .join("\n\n");
}

export function formatReviewComments(
  reviewData: { nodes: GitHubReview[] } | null,
  imageUrlMap?: Map<string, string>,
): string {
  if (!reviewData || !reviewData.nodes) {
    return "";
  }

  let remainingDiffContextChars = MAX_REVIEW_DIFF_CONTEXT_CHARS;

  const formattedReviews = reviewData.nodes.map((review) => {
    let reviewOutput = `[Review by ${review.author?.login ?? "ghost"} at ${review.submittedAt}]: ${review.state}`;

    if (review.body && review.body.trim()) {
      let body = review.body;

      if (imageUrlMap) {
        for (const [originalUrl, localPath] of imageUrlMap) {
          body = body.replaceAll(originalUrl, localPath);
        }
      }

      const sanitizedBody = sanitizeContent(body);
      reviewOutput += `\n${sanitizedBody}`;
    }

    if (
      review.comments &&
      review.comments.nodes &&
      review.comments.nodes.length > 0
    ) {
      const comments = review.comments.nodes
        .filter((comment) => !comment.isMinimized)
        .map((comment) => {
          let body = comment.body;

          if (imageUrlMap) {
            for (const [originalUrl, localPath] of imageUrlMap) {
              body = body.replaceAll(originalUrl, localPath);
            }
          }

          body = sanitizeContent(body);

          let formatted = `  [Comment on ${comment.path}:${comment.line || "?"}]: ${body}`;

          // The diff hunk is the code the comment was left on. Without it the
          // comment arrives without the context it was written against. GitHub
          // can return very large hunks for review comments on long new files,
          // so keep only the header plus nearby tail context and enforce a
          // total review-comment diff budget for the prompt.
          if (comment.diffHunk) {
            const { diffHunk, omitted, consumed } = formatReviewDiffHunk(
              comment.diffHunk,
              remainingDiffContextChars,
            );
            remainingDiffContextChars -= consumed;

            if (diffHunk) {
              formatted += `\n  Diff context${omitted ? " (truncated)" : ""}:\n\`\`\`diff\n${diffHunk}\n\`\`\``;
            } else {
              formatted +=
                "\n  Diff context omitted: review comment diff context budget exceeded.";
            }
          }

          return formatted;
        })
        .join("\n");
      if (comments) {
        reviewOutput += `\n${comments}`;
      }
    }

    return reviewOutput;
  });

  return formattedReviews.join("\n\n");
}

function formatReviewDiffHunk(
  rawDiffHunk: string,
  remainingBudget: number,
): { diffHunk: string; omitted: boolean; consumed: number } {
  if (remainingBudget <= 0) {
    return { diffHunk: "", omitted: true, consumed: 0 };
  }

  const sanitized = sanitizeContent(rawDiffHunk);
  const lines = sanitized.split("\n");
  const header = lines.find((line) => line.startsWith("@@"));
  const tailLines = lines.slice(-REVIEW_DIFF_HUNK_CONTEXT_LINES);
  const candidateLines =
    header && tailLines[0] !== header
      ? [header, "...", ...tailLines]
      : tailLines;
  let diffHunk = candidateLines.join("\n");
  let omitted = diffHunk.length < sanitized.length;
  const maxChars = Math.min(MAX_REVIEW_DIFF_HUNK_CHARS, remainingBudget);

  if (diffHunk.length > maxChars) {
    const prefix = header ? `${header}\n...\n` : "";
    const tailBudget = Math.max(0, maxChars - prefix.length);
    diffHunk = `${prefix}${diffHunk.slice(Math.max(0, diffHunk.length - tailBudget))}`;
    omitted = true;
  }

  if (omitted) {
    diffHunk = `[... diff context truncated to the last ${REVIEW_DIFF_HUNK_CONTEXT_LINES} lines ...]\n${diffHunk}`;
  }

  if (diffHunk.length > remainingBudget) {
    diffHunk = "";
  }

  return { diffHunk, omitted, consumed: diffHunk.length };
}

export function formatChangedFiles(changedFiles: GitHubFile[]): string {
  return changedFiles
    .map(
      (file) =>
        `- ${file.path} (${file.changeType}) +${file.additions}/-${file.deletions}`,
    )
    .join("\n");
}

export function formatChangedFilesWithSHA(
  changedFiles: GitHubFileWithSHA[],
): string {
  return changedFiles
    .map(
      (file) =>
        `- ${file.path} (${file.changeType}) +${file.additions}/-${file.deletions} SHA: ${file.sha}`,
    )
    .join("\n");
}
