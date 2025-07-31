export interface FileTypeInfo {
  category:
    | "image"
    | "document"
    | "text"
    | "video"
    | "archive"
    | "development"
    | "unknown";
  extension: string;
  mimeType?: string;
  sizeLimit: number; // bytes
}

export const SUPPORTED_FILE_TYPES = {
  images: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"],
  documents: [".pdf", ".docx", ".pptx", ".xlsx", ".xls"],
  openDocument: [
    ".odt",
    ".fodt",
    ".ods",
    ".fods",
    ".odp",
    ".fodp",
    ".odg",
    ".fodg",
    ".odf",
  ],
  text: [".txt", ".md", ".csv", ".json", ".jsonc", ".log"],
  videos: [".mp4", ".mov", ".webm"],
  archives: [".zip", ".gz", ".tgz"],
  development: [".patch", ".cpuprofile", ".dmp"],
} as const;

export const FILE_SIZE_LIMITS = {
  images: 10 * 1024 * 1024, // 10MB
  videos: 10 * 1024 * 1024, // 10MB (free plan)
  documents: 25 * 1024 * 1024, // 25MB
  text: 25 * 1024 * 1024, // 25MB
  archives: 25 * 1024 * 1024, // 25MB
  development: 25 * 1024 * 1024, // 25MB
  default: 25 * 1024 * 1024, // 25MB
} as const;

export const URL_PATTERNS = {
  // Existing image patterns (assets)
  MARKDOWN_ASSETS:
    /!\[[^\]]*\]\((https:\/\/github\.com\/user-attachments\/assets\/[^)]+)\)/g,
  IMG_TAG_ASSETS:
    /<img[^>]+src="(https:\/\/github\.com\/user-attachments\/assets\/[^"]+)"[^>]*>/g,

  // New file attachment patterns (files)
  MARKDOWN_FILES:
    /\[[^\]]+\]\((https:\/\/github\.com\/user-attachments\/files\/[^)]+)\)/g,
  IMG_TAG_FILES:
    /<img[^>]+src="(https:\/\/github\.com\/user-attachments\/files\/[^"]+)"[^>]*>/g,

  // General file attachment links
  FILE_ATTACHMENT:
    /\[[^\]]+\]\((https:\/\/github\.com\/user-attachments\/(?:assets|files)\/[^)]+)\)/g,
} as const;

/**
 * Extract file extension from URL
 */
export function extractFileExtension(url: string): string {
  const urlParts = url.split("/");
  const filename = urlParts[urlParts.length - 1];
  if (!filename) {
    return ".unknown";
  }

  const match = filename.match(/\.([a-zA-Z0-9]+)$/i);
  return match ? `.${match[1]!.toLowerCase()}` : ".unknown";
}

/**
 * Get file type information from file extension
 */
export function getFileTypeInfo(url: string): FileTypeInfo {
  const extension = extractFileExtension(url);

  // Image files
  if (SUPPORTED_FILE_TYPES.images.includes(extension as any)) {
    return {
      category: "image",
      extension,
      sizeLimit: FILE_SIZE_LIMITS.images,
    };
  }

  // PDF and Office documents
  if (
    SUPPORTED_FILE_TYPES.documents.includes(extension as any) ||
    SUPPORTED_FILE_TYPES.openDocument.includes(extension as any)
  ) {
    return {
      category: "document",
      extension,
      sizeLimit: FILE_SIZE_LIMITS.documents,
    };
  }

  // Text files
  if (SUPPORTED_FILE_TYPES.text.includes(extension as any)) {
    return {
      category: "text",
      extension,
      sizeLimit: FILE_SIZE_LIMITS.text,
    };
  }

  // Video files
  if (SUPPORTED_FILE_TYPES.videos.includes(extension as any)) {
    return {
      category: "video",
      extension,
      sizeLimit: FILE_SIZE_LIMITS.videos,
    };
  }

  // Archive files
  if (SUPPORTED_FILE_TYPES.archives.includes(extension as any)) {
    return {
      category: "archive",
      extension,
      sizeLimit: FILE_SIZE_LIMITS.archives,
    };
  }

  // Development files
  if (SUPPORTED_FILE_TYPES.development.includes(extension as any)) {
    return {
      category: "development",
      extension,
      sizeLimit: FILE_SIZE_LIMITS.development,
    };
  }

  // Unsupported files
  return {
    category: "unknown",
    extension,
    sizeLimit: FILE_SIZE_LIMITS.default,
  };
}

/**
 * Detect all attachment URLs from comment body
 */
export function detectAllAttachments(
  body: string,
): Array<{ url: string; type: FileTypeInfo }> {
  const urls = new Set<string>();
  const attachments: Array<{ url: string; type: FileTypeInfo }> = [];

  // Detect URLs with each pattern
  const patterns = [
    URL_PATTERNS.MARKDOWN_ASSETS,
    URL_PATTERNS.IMG_TAG_ASSETS,
    URL_PATTERNS.MARKDOWN_FILES,
    URL_PATTERNS.IMG_TAG_FILES,
    URL_PATTERNS.FILE_ATTACHMENT,
  ];

  for (const pattern of patterns) {
    const matches = [...body.matchAll(pattern)];
    for (const match of matches) {
      const url = match[1];
      if (url && !urls.has(url)) {
        urls.add(url);
        const typeInfo = getFileTypeInfo(url);
        attachments.push({ url, type: typeInfo });
      }
    }
  }

  return attachments;
}

/**
 * Check file size (when possible before actual download)
 */
export function validateFileSize(
  fileSize: number,
  typeInfo: FileTypeInfo,
): boolean {
  return fileSize <= typeInfo.sizeLimit;
}

/**
 * Check if file type is supported
 */
export function isSupportedFileType(typeInfo: FileTypeInfo): boolean {
  return typeInfo.category !== "unknown";
}
