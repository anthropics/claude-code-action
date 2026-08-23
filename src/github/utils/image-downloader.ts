import fs from "fs/promises";
import path from "path";
import type { Octokits } from "../api/client";
import { GITHUB_SERVER_URL } from "../api/config";

const escapedUrl = GITHUB_SERVER_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const IMAGE_REGEX = new RegExp(
  `!\\[[^\\]]*\\]\\((${escapedUrl}\\/user-attachments\\/assets\\/[^)]+)\\)`,
  "g",
);

const HTML_IMG_REGEX = new RegExp(
  `<img[^>]+src=["']([^"']*${escapedUrl}\\/user-attachments\\/assets\\/[^"']+)["'][^>]*>`,
  "gi",
);

const SIGNED_URL_REGEX =
  /https:\/\/private-user-images\.githubusercontent\.com\/[^"]+\?jwt=[^"]+/g;

// GitHub identifies an uploaded asset by a GUID that appears both in the
// user-attachment URL and in the signed download URL rendered in body_html.
const ASSET_GUID_REGEX =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function extractAssetGuid(url: string): string | undefined {
  return url.match(ASSET_GUID_REGEX)?.[0]?.toLowerCase();
}

const SIGNED_URL_HOST = "private-user-images.githubusercontent.com";

// Signed download URLs have the shape /<owner-id>/<asset-id>-<guid>.<ext>.
// The GUID must come from the resolved filename, not from anywhere in the raw
// string, so text that merely embeds a GUID cannot claim another asset.
const SIGNED_URL_PATH_REGEX =
  /^\/[^/]+\/[^/]*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.[a-z0-9]+)?$/i;

const DEFAULT_IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000;

function extractSignedUrlAssetGuid(signedUrl: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(signedUrl);
  } catch {
    return undefined;
  }
  if (parsed.host !== SIGNED_URL_HOST) {
    return undefined;
  }
  return parsed.pathname.match(SIGNED_URL_PATH_REGEX)?.[1]?.toLowerCase();
}

type IssueComment = {
  type: "issue_comment";
  id: string;
  body: string;
};

type ReviewComment = {
  type: "review_comment";
  id: string;
  body: string;
};

type ReviewBody = {
  type: "review_body";
  id: string;
  pullNumber: string;
  body: string;
};

type IssueBody = {
  type: "issue_body";
  issueNumber: string;
  body: string;
};

type PullRequestBody = {
  type: "pr_body";
  pullNumber: string;
  body: string;
};

export type CommentWithImages =
  | IssueComment
  | ReviewComment
  | ReviewBody
  | IssueBody
  | PullRequestBody;

type ImageDownloadOptions = {
  timeoutMs?: number;
};

export async function downloadCommentImages(
  octokits: Octokits,
  owner: string,
  repo: string,
  comments: CommentWithImages[],
  options: ImageDownloadOptions = {},
): Promise<Map<string, string>> {
  const urlToPathMap = new Map<string, string>();
  const timeoutMs = options.timeoutMs ?? DEFAULT_IMAGE_DOWNLOAD_TIMEOUT_MS;
  const downloadsDir = "/tmp/github-images";

  await fs.mkdir(downloadsDir, { recursive: true });

  const commentsWithImages: Array<{
    comment: CommentWithImages;
    urls: string[];
  }> = [];

  for (const comment of comments) {
    // Extract URLs from Markdown format
    const markdownMatches = [...comment.body.matchAll(IMAGE_REGEX)];
    const markdownUrls = markdownMatches.map((match) => match[1] as string);

    // Extract URLs from HTML format
    const htmlMatches = [...comment.body.matchAll(HTML_IMG_REGEX)];
    const htmlUrls = htmlMatches.map((match) => match[1] as string);

    // Combine and deduplicate URLs
    const urls = [...new Set([...markdownUrls, ...htmlUrls])];

    if (urls.length > 0) {
      commentsWithImages.push({ comment, urls });
      const id =
        comment.type === "issue_body"
          ? comment.issueNumber
          : comment.type === "pr_body"
            ? comment.pullNumber
            : comment.id;
      console.log(`Found ${urls.length} image(s) in ${comment.type} ${id}`);
    }
  }

  // Process each comment with images
  for (const { comment, urls } of commentsWithImages) {
    try {
      let bodyHtml: string | undefined;

      // Get the HTML version based on comment type
      switch (comment.type) {
        case "issue_comment": {
          const response = await octokits.rest.issues.getComment({
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
          const response = await octokits.rest.pulls.getReviewComment({
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
          const response = await octokits.rest.pulls.getReview({
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
          const response = await octokits.rest.issues.get({
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
          const response = await octokits.rest.pulls.get({
            owner,
            repo,
            pull_number: parseInt(comment.pullNumber),
            mediaType: {
              format: "full+json",
            },
          });
          // Type here seems to be wrong
          bodyHtml = (response.data as any).body_html;
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
      const signedUrls = bodyHtml.match(SIGNED_URL_REGEX) || [];

      // Index the signed URLs by the asset GUID they reference. The signed
      // URLs come from a separate render of the body, so their order and
      // count are not guaranteed to line up with the URLs extracted from the
      // markdown; pairing by asset identifier keeps each download tied to the
      // URL it actually belongs to.
      const signedUrlByGuid = new Map<string, string>();
      for (const signedUrl of signedUrls) {
        const guid = extractSignedUrlAssetGuid(signedUrl);
        if (guid && !signedUrlByGuid.has(guid)) {
          signedUrlByGuid.set(guid, signedUrl);
        }
      }

      // Download each image
      for (const [i, originalUrl] of urls.entries()) {
        // Check if we've already downloaded this URL
        if (urlToPathMap.has(originalUrl)) {
          continue;
        }

        const guid = extractAssetGuid(originalUrl);
        const signedUrl = guid ? signedUrlByGuid.get(guid) : undefined;
        if (!signedUrl) {
          console.warn(
            `No matching signed URL found for ${originalUrl}, skipping`,
          );
          continue;
        }

        try {
          console.log(`Downloading ${originalUrl}...`);

          const buffer = await fetchImage(signedUrl, timeoutMs);

          // GitHub user-attachment URLs (/user-attachments/assets/<uuid>) carry
          // no file extension, so the URL-based guess silently falls back to
          // ".png". When the bytes are actually JPEG/GIF/WebP, the saved file is
          // mislabeled and the Read tool sends a base64 image with the wrong
          // media_type, which the Anthropic API rejects (400 invalid_request).
          // Detect the real type from the magic bytes and only fall back to the
          // URL extension when the signature is unrecognized.
          const fileExtension =
            detectImageExtensionFromBuffer(buffer) ??
            getImageExtension(originalUrl);
          const filename = `image-${Date.now()}-${i}${fileExtension}`;
          const localPath = path.join(downloadsDir, filename);

          await fs.writeFile(localPath, buffer);
          console.log(`✓ Saved: ${localPath}`);

          urlToPathMap.set(originalUrl, localPath);
        } catch (error) {
          console.error(`✗ Failed to download ${originalUrl}:`, error);
        }
      }
    } catch (error) {
      const id =
        comment.type === "issue_body"
          ? comment.issueNumber
          : comment.type === "pr_body"
            ? comment.pullNumber
            : comment.id;
      console.error(
        `Failed to process images for ${comment.type} ${id}:`,
        error,
      );
    }
  }

  return urlToPathMap;
}

async function fetchImage(url: string, timeoutMs: number): Promise<Buffer> {
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(new Error(`Image download timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetch(url, { signal: controller.signal }),
      timeoutPromise,
    ]);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const arrayBuffer = await Promise.race([
      response.arrayBuffer(),
      timeoutPromise,
    ]);
    return Buffer.from(arrayBuffer);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

function getImageExtension(url: string): string {
  const urlParts = url.split("/");
  const filename = urlParts[urlParts.length - 1];
  if (!filename) {
    throw new Error("Invalid URL: No filename found");
  }

  const match = filename.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i);
  return match ? match[0] : ".png";
}

/**
 * Determine an image's file extension from its magic bytes, independent of the
 * (often extensionless) source URL. Returns undefined when the signature is not
 * a format we can confidently identify, so the caller can fall back to the
 * URL-based extension. Covers the raster formats the Anthropic API accepts.
 */
function detectImageExtensionFromBuffer(buffer: Buffer): string | undefined {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return ".png";
  }
  // JPEG: FF D8 FF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return ".jpg";
  }
  // GIF: "GIF8" (47 49 46 38)
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return ".gif";
  }
  // WebP: "RIFF" (52 49 46 46) .... "WEBP" (57 45 42 50) at offset 8
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return ".webp";
  }
  return undefined;
}
