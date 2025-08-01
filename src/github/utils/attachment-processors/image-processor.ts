import fs from "fs/promises";
import path from "path";
import type { FileTypeInfo } from "../file-type-detector";

export interface ImageProcessResult {
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
 * Process and download image files
 */
export async function processImageFile(
  url: string,
  signedUrl: string,
  typeInfo: FileTypeInfo,
  downloadsDir: string,
  index: number,
): Promise<ImageProcessResult> {
  try {
    console.log(`Downloading ${url}...`);

    const imageResponse = await fetch(signedUrl);
    if (!imageResponse.ok) {
      throw new Error(
        `HTTP ${imageResponse.status}: ${imageResponse.statusText}`,
      );
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check file size
    if (buffer.length > typeInfo.sizeLimit) {
      throw new Error(
        `File size ${buffer.length} bytes exceeds limit of ${typeInfo.sizeLimit} bytes`,
      );
    }

    const filename = `image-${Date.now()}-${index}${typeInfo.extension}`;
    const localPath = path.join(downloadsDir, filename);

    await fs.writeFile(localPath, buffer);
    console.log(`✓ Saved: ${localPath}`);

    return {
      success: true,
      localPath,
      fileSize: buffer.length,
      metadata: {
        filename,
        type: "image",
      },
    };
  } catch (error) {
    console.error(`✗ Failed to download ${url}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Extract file extension for images (backward compatibility)
 */
export function getImageExtension(url: string): string {
  const urlParts = url.split("/");
  const filename = urlParts[urlParts.length - 1];
  if (!filename) {
    throw new Error("Invalid URL: No filename found");
  }

  const match = filename.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i);
  return match ? match[0] : ".png";
}
