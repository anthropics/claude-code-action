/**
 * Extract original filename from URL
 */
export function extractFilenameFromUrl(url: string): string | null {
  try {
    const urlParts = url.split("/");
    const filename = urlParts[urlParts.length - 1];

    // Remove query parameters if present
    const cleanFilename = filename?.split("?")[0];
    return cleanFilename || null;
  } catch {
    return null;
  }
}
