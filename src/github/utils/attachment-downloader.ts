import fs from "fs/promises";
import type { Octokits } from "../api/client";
import {
  detectAllAttachments,
  isSupportedFileType,
  type FileTypeInfo,
} from "./file-type-detector";
import {
  processImageFile,
  type ImageProcessResult,
} from "./attachment-processors/image-processor";
import {
  processDocumentFile,
  type DocumentProcessResult,
} from "./attachment-processors/document-processor";
import {
  processTextFile,
  type TextProcessResult,
} from "./attachment-processors/text-processor";
import {
  processMediaFile,
  type MediaProcessResult,
} from "./attachment-processors/media-processor";
import { extractFilenameFromUrl } from "./url-utils";
import {
  type GitHubCommentResponse,
  type GitHubReviewResponse,
  type GitHubIssueResponse,
  type GitHubPullRequestResponse,
  hasBodyHtml,
} from "./github-api-types";

// Import and re-export types from image-downloader for backward compatibility
import type { CommentWithImages } from "./image-downloader";
export type { CommentWithImages } from "./image-downloader";

export interface AttachmentInfo {
  type:
    | "image"
    | "document"
    | "text"
    | "video"
    | "archive"
    | "development"
    | "unknown";
  localPath?: string;
  fileSize?: number;
  metadata?: any;
  error?: string;
  downloadSkipped?: boolean;
}

export interface AttachmentResult {
  attachments: Map<string, AttachmentInfo>;
  summary: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    byType: Record<string, number>;
  };
}

/**
 * Download all types of attachments from GitHub comments
 */
export async function downloadCommentAttachments(
  octokits: Octokits,
  owner: string,
  repo: string,
  comments: CommentWithImages[],
): Promise<AttachmentResult> {
  const attachments = new Map<string, AttachmentInfo>();
  const downloadsDir = "/tmp/github-attachments";

  await fs.mkdir(downloadsDir, { recursive: true });

  const commentsWithAttachments: Array<{
    comment: CommentWithImages;
    attachments: Array<{ url: string; type: FileTypeInfo }>;
  }> = [];

  // Detect all attachments in comments
  for (const comment of comments) {
    const detectedAttachments = detectAllAttachments(comment.body);

    if (detectedAttachments.length > 0) {
      commentsWithAttachments.push({
        comment,
        attachments: detectedAttachments,
      });
      const id =
        comment.type === "issue_body"
          ? comment.issueNumber
          : comment.type === "pr_body"
            ? comment.pullNumber
            : comment.id;

      const supportedCount = detectedAttachments.filter((a) =>
        isSupportedFileType(a.type),
      ).length;
      const unsupportedCount = detectedAttachments.length - supportedCount;

      console.log(
        `Found ${detectedAttachments.length} attachment(s) in ${comment.type} ${id}`,
      );
      if (unsupportedCount > 0) {
        console.log(
          `  - ${supportedCount} supported, ${unsupportedCount} unsupported`,
        );
      }
    }
  }

  // Process each comment with attachments
  for (const {
    comment,
    attachments: commentAttachments,
  } of commentsWithAttachments) {
    try {
      let bodyHtml: string | undefined;

      // Get the HTML version based on comment type
      switch (comment.type) {
        case "issue_comment": {
          const response: GitHubCommentResponse =
            await octokits.rest.issues.getComment({
              owner,
              repo,
              comment_id: parseInt(comment.id),
              mediaType: {
                format: "full+json",
              },
            });
          bodyHtml = response.data.body_html;
          break;
        }
        case "review_comment": {
          const response: GitHubCommentResponse =
            await octokits.rest.pulls.getReviewComment({
              owner,
              repo,
              comment_id: parseInt(comment.id),
              mediaType: {
                format: "full+json",
              },
            });
          bodyHtml = response.data.body_html;
          break;
        }
        case "review_body": {
          const response: GitHubReviewResponse =
            await octokits.rest.pulls.getReview({
              owner,
              repo,
              pull_number: parseInt(comment.pullNumber),
              review_id: parseInt(comment.id),
              mediaType: {
                format: "full+json",
              },
            });
          bodyHtml = response.data.body_html;
          break;
        }
        case "issue_body": {
          const response: GitHubIssueResponse = await octokits.rest.issues.get({
            owner,
            repo,
            issue_number: parseInt(comment.issueNumber),
            mediaType: {
              format: "full+json",
            },
          });
          bodyHtml = response.data.body_html;
          break;
        }
        case "pr_body": {
          const response: GitHubPullRequestResponse =
            await octokits.rest.pulls.get({
              owner,
              repo,
              pull_number: parseInt(comment.pullNumber),
              mediaType: {
                format: "full+json",
              },
            });
          bodyHtml = hasBodyHtml(response)
            ? response.data.body_html
            : undefined;
          break;
        }
      }

      if (!bodyHtml) {
        const id =
          comment.type === "issue_body"
            ? comment.issueNumber
            : comment.type === "pr_body"
              ? comment.pullNumber
              : comment.id;
        console.warn(`No HTML body found for ${comment.type} ${id}`);
        continue;
      }

      // Extract signed URLs from HTML
      const signedUrlRegex =
        /https:\/\/private-user-images\.githubusercontent\.com\/[^"]+\?jwt=[^"]+/g;
      const signedUrls = bodyHtml.match(signedUrlRegex) || [];

      // Process each attachment
      for (
        let i = 0;
        i < Math.min(signedUrls.length, commentAttachments.length);
        i++
      ) {
        const signedUrl = signedUrls[i];
        const attachment = commentAttachments[i];

        if (!signedUrl || !attachment) {
          continue;
        }

        const { url: originalUrl, type: typeInfo } = attachment;

        // Check if we've already processed this URL
        if (attachments.has(originalUrl)) {
          continue;
        }

        // Process based on file type
        const result = await processAttachment(
          originalUrl,
          signedUrl,
          typeInfo,
          downloadsDir,
          i,
        );

        attachments.set(originalUrl, result);
      }
    } catch (error) {
      const id =
        comment.type === "issue_body"
          ? comment.issueNumber
          : comment.type === "pr_body"
            ? comment.pullNumber
            : comment.id;
      console.error(
        `Failed to process attachments for ${comment.type} ${id}:`,
        error,
      );
    }
  }

  // Generate summary
  const summary = generateSummary(attachments);

  return {
    attachments,
    summary,
  };
}

/**
 * Process a single attachment based on its type
 */
async function processAttachment(
  url: string,
  signedUrl: string,
  typeInfo: FileTypeInfo,
  downloadsDir: string,
  index: number,
): Promise<AttachmentInfo> {
  // Check if file type is supported
  if (!isSupportedFileType(typeInfo)) {
    console.warn(`⚠️ Unsupported file type: ${url} (${typeInfo.extension})`);
    return {
      type: "unknown",
      error: `Unsupported file type: ${typeInfo.extension}`,
      metadata: {
        filename: extractFilenameFromUrl(url),
        originalUrl: url,
      },
    };
  }

  try {
    let result:
      | ImageProcessResult
      | DocumentProcessResult
      | TextProcessResult
      | MediaProcessResult;

    switch (typeInfo.category) {
      case "image":
        result = await processImageFile(
          url,
          signedUrl,
          typeInfo,
          downloadsDir,
          index,
        );
        break;
      case "document":
        result = await processDocumentFile(
          url,
          signedUrl,
          typeInfo,
          downloadsDir,
          index,
        );
        break;
      case "text":
        result = await processTextFile(
          url,
          signedUrl,
          typeInfo,
          downloadsDir,
          index,
        );
        break;
      case "video":
      case "archive":
      case "development":
        result = await processMediaFile(
          url,
          signedUrl,
          typeInfo,
          downloadsDir,
          index,
        );
        break;
      default:
        throw new Error(`Unhandled file category: ${typeInfo.category}`);
    }

    if (result.success) {
      return {
        type: typeInfo.category,
        localPath: result.localPath,
        fileSize: result.fileSize,
        metadata: result.metadata,
        downloadSkipped:
          "metadata" in result
            ? (result.metadata as any)?.downloadSkipped
            : undefined,
      };
    } else {
      return {
        type: typeInfo.category,
        error: result.error,
        metadata: {
          filename: extractFilenameFromUrl(url),
          originalUrl: url,
        },
      };
    }
  } catch (error) {
    console.error(
      `✗ Failed to process ${typeInfo.category} file ${url}:`,
      error,
    );
    return {
      type: typeInfo.category,
      error: error instanceof Error ? error.message : String(error),
      metadata: {
        filename: extractFilenameFromUrl(url),
        originalUrl: url,
      },
    };
  }
}

/**
 * Generate summary statistics
 */
function generateSummary(attachments: Map<string, AttachmentInfo>) {
  const summary = {
    total: attachments.size,
    successful: 0,
    failed: 0,
    skipped: 0,
    byType: {} as Record<string, number>,
  };

  for (const attachment of attachments.values()) {
    // Count by result
    if (attachment.error) {
      summary.failed++;
    } else if (attachment.downloadSkipped) {
      summary.skipped++;
    } else {
      summary.successful++;
    }

    // Count by type
    summary.byType[attachment.type] =
      (summary.byType[attachment.type] || 0) + 1;
  }

  return summary;
}
