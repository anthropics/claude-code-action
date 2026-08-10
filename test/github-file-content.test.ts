import { describe, expect, test } from "bun:test";
import { createBase64BlobPayload } from "../src/mcp/github-file-content";

describe("GitHub blob content", () => {
  test("preserves bytes for binary files with unlisted extensions", () => {
    const binaryContent = Uint8Array.from([
      0x00, 0xff, 0xd8, 0x80, 0x1a, 0x7f, 0xc3, 0x28,
    ]);

    expect(createBase64BlobPayload(binaryContent)).toEqual({
      content: Buffer.from(binaryContent).toString("base64"),
      encoding: "base64",
    });
  });

  test("encodes text files without changing their bytes", () => {
    const textContent = new TextEncoder().encode("line 1\nline 2\n");

    expect(createBase64BlobPayload(textContent)).toEqual({
      content: Buffer.from(textContent).toString("base64"),
      encoding: "base64",
    });
  });
});
