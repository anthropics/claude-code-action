import { describe, expect, it } from "bun:test";
import { isBinaryContent } from "../src/mcp/binary-detection";

describe("isBinaryContent", () => {
  describe("text content", () => {
    it("treats ASCII as text", () => {
      expect(isBinaryContent(Buffer.from("hello world\n"))).toBe(false);
    });

    it("treats multibyte UTF-8 as text", () => {
      expect(isBinaryContent(Buffer.from("café — 日本語 🎉\n"))).toBe(false);
    });

    it("treats an empty file as text", () => {
      expect(isBinaryContent(Buffer.from(""))).toBe(false);
    });

    it("treats CRLF and tabs as text", () => {
      expect(isBinaryContent(Buffer.from("a\tb\r\nc\r\n"))).toBe(false);
    });
  });

  describe("binary content", () => {
    // The extensions below are the ones the previous allowlist covered, so
    // these files were already committed correctly.
    it("detects PNG", () => {
      expect(
        isBinaryContent(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])),
      ).toBe(true);
    });

    // These are the regression cases: binary formats that were not on the
    // allowlist and got decoded as UTF-8, corrupting the committed bytes.
    it("detects BMP", () => {
      expect(
        isBinaryContent(Buffer.from([0x42, 0x4d, 0x36, 0x00, 0x00, 0x00])),
      ).toBe(true);
    });

    it("detects SQLite databases", () => {
      expect(isBinaryContent(Buffer.from("SQLite format 3\0", "binary"))).toBe(
        true,
      );
    });

    it("detects WebAssembly modules", () => {
      expect(
        isBinaryContent(Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00])),
      ).toBe(true);
    });

    it("detects arbitrary invalid UTF-8 without NUL bytes", () => {
      // Lone continuation bytes: no NUL, but not decodable as UTF-8 either.
      expect(isBinaryContent(Buffer.from([0xc3, 0x28, 0xa0, 0xa1]))).toBe(true);
    });

    it("detects a truncated multibyte sequence", () => {
      // First two bytes of a 3-byte character, cut short.
      expect(isBinaryContent(Buffer.from([0xe6, 0x97]))).toBe(true);
    });
  });

  it("round-trips text through UTF-8 without loss", () => {
    const original = "acentuação, emoji 🚀, símbolos ±≠";
    const buffer = Buffer.from(original);

    expect(isBinaryContent(buffer)).toBe(false);
    expect(buffer.toString("utf-8")).toBe(original);
  });

  it("preserves bytes that a UTF-8 decode would have replaced", () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x10, 0x4a]);

    expect(isBinaryContent(bytes)).toBe(true);
    // What the old text path would have produced, versus base64.
    expect(Buffer.from(bytes.toString("utf-8"), "utf-8")).not.toEqual(bytes);
    expect(Buffer.from(bytes.toString("base64"), "base64")).toEqual(bytes);
  });
});
