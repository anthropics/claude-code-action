import fs from "fs/promises";
import path from "path";
import type { FileTypeInfo } from "../file-type-detector";
import { extractFilenameFromUrl } from "../url-utils";

export interface DocumentProcessResult {
  success: boolean;
  localPath?: string;
  error?: string;
  fileSize?: number;
  metadata?: {
    filename: string;
    type: string;
  };
}

/**
 * Process and download document files (PDF, Office, OpenDocument)
 */
export async function processDocumentFile(
  url: string,
  signedUrl: string,
  typeInfo: FileTypeInfo,
  downloadsDir: string,
  index: number,
): Promise<DocumentProcessResult> {
  try {
    console.log(`Downloading document ${url}...`);

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

    const originalFilename = extractFilenameFromUrl(url);
    const filename = `document-${Date.now()}-${index}${typeInfo.extension}`;
    const localPath = path.join(downloadsDir, filename);

    await fs.writeFile(localPath, buffer);
    console.log(`✓ Saved document: ${localPath}`);

    return {
      success: true,
      localPath,
      fileSize: buffer.length,
      metadata: {
        filename: originalFilename || filename,
        type: typeInfo.category,
      },
    };
  } catch (error) {
    console.error(`✗ Failed to download document ${url}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if file is a supported document type
 */
export function isSupportedDocument(extension: string): boolean {
  const supportedExtensions = [
    ".pdf",
    ".docx",
    ".pptx",
    ".xlsx",
    ".xls",
    ".odt",
    ".fodt",
    ".ods",
    ".fods",
    ".odp",
    ".fodp",
    ".odg",
    ".fodg",
    ".odf",
  ];
  return supportedExtensions.includes(extension.toLowerCase());
}
