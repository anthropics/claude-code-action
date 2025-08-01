/**
 * Maximum length for text content sent to LLM to optimize token usage
 */
export const MAX_TEXT_CONTENT_LENGTH = 10000;

/**
 * File size limits for different file types (in bytes)
 */
export const FILE_SIZE_LIMITS = {
  IMAGE: 10 * 1024 * 1024, // 10MB
  DOCUMENT: 25 * 1024 * 1024, // 25MB
  TEXT: 25 * 1024 * 1024, // 25MB
  ARCHIVE: 25 * 1024 * 1024, // 25MB
  DEVELOPMENT: 25 * 1024 * 1024, // 25MB
} as const;

/**
 * Error messages for different scenarios
 */
export const ERROR_MESSAGES = {
  VIDEO_SKIP_REASON:
    "Video files are not downloaded to optimize bandwidth and storage usage",
  FILE_SIZE_EXCEEDED: "File size exceeds the allowed limit",
  BINARY_FILE_DETECTED: "File appears to be binary, not text",
  INVALID_URL: "Invalid URL: No filename found",
  HTTP_ERROR: "HTTP request failed",
} as const;
