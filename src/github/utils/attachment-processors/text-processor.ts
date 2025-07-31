import fs from "fs/promises";
import path from "path";
import type { FileTypeInfo } from "../file-type-detector";
import { extractFilenameFromUrl } from "../url-utils";
import { MAX_TEXT_CONTENT_LENGTH, ERROR_MESSAGES } from "../constants";

export interface TextProcessResult {
  success: boolean;
  localPath?: string;
  error?: string;
  fileSize?: number;
  content?: string;
  metadata?: {
    filename: string;
    encoding: string;
    lineCount?: number;
  };
}

/**
 * Process and download text files (txt, md, csv, json, log, etc.)
 */
export async function processTextFile(
  url: string,
  signedUrl: string,
  typeInfo: FileTypeInfo,
  downloadsDir: string,
  index: number,
): Promise<TextProcessResult> {
  try {
    console.log(`Downloading text file ${url}...`);

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

    // Try to decode as UTF-8 text
    const content = buffer.toString("utf-8");

    // Validate that it's actually text (not binary)
    if (!isValidText(content)) {
      throw new Error(ERROR_MESSAGES.BINARY_FILE_DETECTED);
    }

    const originalFilename = extractFilenameFromUrl(url);
    const filename = `text-${Date.now()}-${index}${typeInfo.extension}`;
    const localPath = path.join(downloadsDir, filename);

    await fs.writeFile(localPath, buffer);
    console.log(`✓ Saved text file: ${localPath}`);

    const lineCount = content.split("\n").length;

    return {
      success: true,
      localPath,
      fileSize: buffer.length,
      content:
        content.length > MAX_TEXT_CONTENT_LENGTH
          ? content.substring(0, MAX_TEXT_CONTENT_LENGTH) + "..."
          : content,
      metadata: {
        filename: originalFilename || filename,
        encoding: "utf-8",
        lineCount,
      },
    };
  } catch (error) {
    console.error(`✗ Failed to download text file ${url}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if content is valid text (not binary)
 */
function isValidText(content: string): boolean {
  // Check for null bytes (common in binary files)
  if (content.includes("\0")) {
    return false;
  }

  // Check for excessive non-printable characters
  const nonPrintableCount = (
    content.match(/[\x00-\x08\x0E-\x1F\x7F-\x9F]/g) || []
  ).length;
  const nonPrintableRatio = nonPrintableCount / content.length;

  // If more than 5% of characters are non-printable, likely binary
  return nonPrintableRatio < 0.05;
}

/**
 * Check if file is a supported text type
 */
export function isSupportedTextFile(extension: string): boolean {
  const supportedExtensions = [
    ".txt",
    ".md",
    ".csv",
    ".json",
    ".jsonc",
    ".log",
  ];
  return supportedExtensions.includes(extension.toLowerCase());
}

/**
 * Get appropriate MIME type for text file
 */
export function getTextMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".json": "application/json",
    ".jsonc": "application/json",
    ".log": "text/plain",
  };

  return mimeTypes[extension.toLowerCase()] || "text/plain";
}
