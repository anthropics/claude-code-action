import fs from "fs/promises";
import path from "path";
import type { FileTypeInfo } from "../file-type-detector";
import { extractFilenameFromUrl } from "../url-utils";
import { ERROR_MESSAGES } from "../constants";

export interface MediaProcessResult {
  success: boolean;
  localPath?: string;
  error?: string;
  fileSize?: number;
  metadata?: {
    filename: string;
    type: string;
    downloadSkipped?: boolean;
    reason?: string;
  };
}

/**
 * Process media files (videos, archives, development files)
 */
export async function processMediaFile(
  url: string,
  signedUrl: string,
  typeInfo: FileTypeInfo,
  downloadsDir: string,
  index: number,
): Promise<MediaProcessResult> {
  try {
    const originalFilename = extractFilenameFromUrl(url);

    // For video files, we might want to skip download and just save metadata
    if (typeInfo.category === "video") {
      return processVideoFile(url, originalFilename, typeInfo);
    }

    // For archives and development files, download them
    return await downloadMediaFile(
      url,
      signedUrl,
      typeInfo,
      downloadsDir,
      index,
      originalFilename,
    );
  } catch (error) {
    console.error(`✗ Failed to process media file ${url}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Process video files (usually just metadata, not actual download)
 */
function processVideoFile(
  url: string,
  originalFilename: string | null,
  typeInfo: FileTypeInfo,
): MediaProcessResult {
  console.log(`📹 Video file detected: ${url}`);
  console.log(`   File type: ${typeInfo.extension}`);
  console.log(
    `   Note: Video files are not downloaded, please view directly on GitHub`,
  );

  return {
    success: true,
    metadata: {
      filename: originalFilename || `video${typeInfo.extension}`,
      type: "video",
      downloadSkipped: true,
      reason: ERROR_MESSAGES.VIDEO_SKIP_REASON,
    },
  };
}

/**
 * Download archive and development files
 */
async function downloadMediaFile(
  url: string,
  signedUrl: string,
  typeInfo: FileTypeInfo,
  downloadsDir: string,
  index: number,
  originalFilename: string | null,
): Promise<MediaProcessResult> {
  console.log(`Downloading ${typeInfo.category} file ${url}...`);

  const response = await fetch(signedUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Check file size
  if (buffer.length > typeInfo.sizeLimit) {
    throw new Error(
      `File size ${buffer.length} bytes exceeds limit of ${typeInfo.sizeLimit} bytes`,
    );
  }

  const filename = `${typeInfo.category}-${Date.now()}-${index}${typeInfo.extension}`;
  const localPath = path.join(downloadsDir, filename);

  await fs.writeFile(localPath, buffer);
  console.log(`✓ Saved ${typeInfo.category} file: ${localPath}`);

  return {
    success: true,
    localPath,
    fileSize: buffer.length,
    metadata: {
      filename: originalFilename || filename,
      type: typeInfo.category,
    },
  };
}

/**
 * Check if file is a supported video type
 */
export function isSupportedVideo(extension: string): boolean {
  const supportedExtensions = [".mp4", ".mov", ".webm"];
  return supportedExtensions.includes(extension.toLowerCase());
}

/**
 * Check if file is a supported archive type
 */
export function isSupportedArchive(extension: string): boolean {
  const supportedExtensions = [".zip", ".gz", ".tgz"];
  return supportedExtensions.includes(extension.toLowerCase());
}

/**
 * Check if file is a supported development file type
 */
export function isSupportedDevelopmentFile(extension: string): boolean {
  const supportedExtensions = [".patch", ".cpuprofile", ".dmp"];
  return supportedExtensions.includes(extension.toLowerCase());
}

/**
 * Get file category description
 */
export function getMediaFileDescription(category: string): string {
  const descriptions: Record<string, string> = {
    video: "Video file (not downloaded due to size)",
    archive: "Archive file",
    development: "Development/debugging file",
  };

  return descriptions[category] || "Media file";
}
