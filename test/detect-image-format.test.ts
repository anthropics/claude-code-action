import { describe, test, expect } from "bun:test";
import { detectImageFormat } from "../src/github/utils/detect-image-format";

describe("detectImageFormat", () => {
  test("should detect PNG format", () => {
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(detectImageFormat(pngBuffer)).toBe(".png");
  });

  test("should detect JPEG format", () => {
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(detectImageFormat(jpegBuffer)).toBe(".jpg");
  });

  test("should detect GIF87a format", () => {
    const gif87Buffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
    expect(detectImageFormat(gif87Buffer)).toBe(".gif");
  });

  test("should detect GIF89a format", () => {
    const gif89Buffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(detectImageFormat(gif89Buffer)).toBe(".gif");
  });

  test("should detect WebP format", () => {
    const webpBuffer = Buffer.from([
      0x52,
      0x49,
      0x46,
      0x46, // RIFF
      0x00,
      0x00,
      0x00,
      0x00, // File size (placeholder)
      0x57,
      0x45,
      0x42,
      0x50, // WEBP
    ]);
    expect(detectImageFormat(webpBuffer)).toBe(".webp");
  });

  test("should detect BMP format", () => {
    const bmpBuffer = Buffer.from([0x42, 0x4d, 0x00, 0x00]);
    expect(detectImageFormat(bmpBuffer)).toBe(".bmp");
  });

  test("should detect ICO format", () => {
    const icoBuffer = Buffer.from([0x00, 0x00, 0x01, 0x00]);
    expect(detectImageFormat(icoBuffer)).toBe(".ico");
  });

  test("should return null for unknown formats", () => {
    const unknownBuffer = Buffer.from([0x12, 0x34, 0x56, 0x78]);
    expect(detectImageFormat(unknownBuffer)).toBe(null);
  });

  test("should return null for empty buffer", () => {
    const emptyBuffer = Buffer.from([]);
    expect(detectImageFormat(emptyBuffer)).toBe(null);
  });

  test("should return null for truncated buffers", () => {
    // Truncated PNG (only 2 bytes, needs 8)
    const truncatedPng = Buffer.from([0x89, 0x50]);
    expect(detectImageFormat(truncatedPng)).toBe(null);

    // Truncated JPEG (only 2 bytes, needs 3)
    const truncatedJpeg = Buffer.from([0xff, 0xd8]);
    expect(detectImageFormat(truncatedJpeg)).toBe(null);
  });

  test("should not mistake similar patterns", () => {
    // Buffer that starts like WebP but isn't (has WAVE instead of WEBP)
    const fakeWebp = Buffer.from([
      0x52,
      0x49,
      0x46,
      0x46, // RIFF
      0x00,
      0x00,
      0x00,
      0x00, // File size
      0x57,
      0x41,
      0x56,
      0x45, // WAVE (not WEBP)
    ]);
    expect(detectImageFormat(fakeWebp)).toBe(null); // Should return null for unrecognized
  });
});
