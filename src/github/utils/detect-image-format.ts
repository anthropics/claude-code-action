/**
 * Magic byte patterns for common image formats
 */

// PNG: 89 50 4E 47 0D 0A 1A 0A (‰PNG\r\n\x1a\n)
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

// JPEG: FF D8 FF (ÿØÿ)
const JPEG_MAGIC = [0xff, 0xd8, 0xff] as const;

// GIF87a: 47 49 46 38 37 61 (GIF87a)
const GIF87_MAGIC = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] as const;

// GIF89a: 47 49 46 38 39 61 (GIF89a)
const GIF89_MAGIC = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] as const;

// WebP: RIFF....WEBP
// First 4 bytes: 52 49 46 46 (RIFF)
const WEBP_RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46] as const;
// Bytes 8-11: 57 45 42 50 (WEBP)
const WEBP_WEBP_MAGIC = [0x57, 0x45, 0x42, 0x50] as const;

// BMP: 42 4D (BM)
const BMP_MAGIC = [0x42, 0x4d] as const;

// ICO: 00 00 01 00
const ICO_MAGIC = [0x00, 0x00, 0x01, 0x00] as const;

/**
 * Check if buffer starts with the given magic bytes
 */
function matchesMagicBytes(
  buffer: Buffer,
  magic: readonly number[],
  offset = 0,
): boolean {
  if (buffer.length < offset + magic.length) {
    return false;
  }

  for (let i = 0; i < magic.length; i++) {
    if (buffer[offset + i] !== magic[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Detect image format from binary data using magic bytes
 * @param buffer The image buffer to check
 * @returns The detected file extension (e.g., ".jpg", ".png", ".gif") or null if format cannot be detected
 */
export function detectImageFormat(buffer: Buffer): string | null {
  // PNG check (8 bytes)
  if (matchesMagicBytes(buffer, PNG_MAGIC)) {
    return ".png";
  }

  // JPEG check (3 bytes)
  if (matchesMagicBytes(buffer, JPEG_MAGIC)) {
    return ".jpg";
  }

  // GIF check (6 bytes for both GIF87a and GIF89a)
  if (
    matchesMagicBytes(buffer, GIF87_MAGIC) ||
    matchesMagicBytes(buffer, GIF89_MAGIC)
  ) {
    return ".gif";
  }

  // WebP check (RIFF header at start, WEBP at bytes 8-11)
  if (
    matchesMagicBytes(buffer, WEBP_RIFF_MAGIC) &&
    matchesMagicBytes(buffer, WEBP_WEBP_MAGIC, 8)
  ) {
    return ".webp";
  }

  // BMP check (2 bytes)
  if (matchesMagicBytes(buffer, BMP_MAGIC)) {
    return ".bmp";
  }

  // ICO check (4 bytes)
  if (matchesMagicBytes(buffer, ICO_MAGIC)) {
    return ".ico";
  }

  // Cannot detect format - return null to indicate unknown
  console.warn(
    "Could not detect image format from binary data, will skip image",
  );
  return null;
}
