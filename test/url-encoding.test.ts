import { expect, describe, it } from "bun:test";
import { ensureProperlyEncodedUrl } from "../src/github/operations/comment-logic";

describe("ensureProperlyEncodedUrl", () => {
  it("should handle URLs with spaces", () => {
    const url =
      "https://github.com/owner/repo/compare/main...branch?quick_pull=1&title=fix: update message&body=Description here";
    const expected =
      "https://github.com/owner/repo/compare/main...branch?quick_pull=1&title=fix%3A+update+message&body=Description+here";
    expect(ensureProperlyEncodedUrl(url)).toBe(expected);
  });

  it("should handle URLs with unencoded colons", () => {
    const url =
      "https://github.com/owner/repo/compare/main...branch?quick_pull=1&title=fix: update message";
    const expected =
      "https://github.com/owner/repo/compare/main...branch?quick_pull=1&title=fix%3A+update+message";
    expect(ensureProperlyEncodedUrl(url)).toBe(expected);
  });

  it("should handle URLs that are already properly encoded", () => {
    const url =
      "https://github.com/owner/repo/compare/main...branch?quick_pull=1&title=fix%3A%20update%20message&body=Description%20here";
    expect(ensureProperlyEncodedUrl(url)).toBe(url);
  });

  it("should handle URLs with partially encoded content", () => {
    const url =
      "https://github.com/owner/repo/compare/main...branch?quick_pull=1&title=fix%3A update message&body=Description here";
    const expected =
      "https://github.com/owner/repo/compare/main...branch?quick_pull=1&title=fix%3A+update+message&body=Description+here";
    expect(ensureProperlyEncodedUrl(url)).toBe(expected);
  });

  it("should handle URLs with special characters", () => {
    const url =
      "https://github.com/owner/repo/compare/main...branch?quick_pull=1&title=feat(scope): add new feature!&body=This is a description with #123";
    const expected =
      "https://github.com/owner/repo/compare/main...branch?quick_pull=1&title=feat%28scope%29%3A+add+new+feature%21&body=This+is+a+description+with+%23123";
    expect(ensureProperlyEncodedUrl(url)).toBe(expected);
  });

  it("should not encode the base URL", () => {
    const url =
      "https://github.com/owner/repo/compare/main...feature/new-branch?quick_pull=1&title=fix: test";
    const expected =
      "https://github.com/owner/repo/compare/main...feature/new-branch?quick_pull=1&title=fix%3A+test";
    expect(ensureProperlyEncodedUrl(url)).toBe(expected);
  });

  it("should handle malformed URLs gracefully", () => {
    const url =
      "https://github.com/owner/repo/compare/main...branch?quick_pull=1&title=fix: test&body=";
    const expected =
      "https://github.com/owner/repo/compare/main...branch?quick_pull=1&title=fix%3A+test&body=";
    expect(ensureProperlyEncodedUrl(url)).toBe(expected);
  });

  it("should handle URLs with line breaks in parameters", () => {
    const url =
      "https://github.com/owner/repo/compare/main...branch?quick_pull=1&title=fix: test&body=Line 1\nLine 2";
    const expected =
      "https://github.com/owner/repo/compare/main...branch?quick_pull=1&title=fix%3A+test&body=Line+1%0ALine+2";
    expect(ensureProperlyEncodedUrl(url)).toBe(expected);
  });

  it("should return null for completely invalid URLs", () => {
    const url = "not-a-url-at-all";
    expect(ensureProperlyEncodedUrl(url)).toBe(null);
  });

  it("should handle URLs with severe malformation", () => {
    const url = "https://[invalid:url:format]/path";
    expect(ensureProperlyEncodedUrl(url)).toBe(null);
  });

  it("should preserve equals signs in query parameter values", () => {
    const url =
      "https://github.com/owner/repo/compare/main...branch?title=fix this&body=data=value";
    const result = ensureProperlyEncodedUrl(url);
    expect(result).toContain("body=data%3Dvalue");
  });

  it("should preserve multiple equals signs in query parameter values", () => {
    const url =
      "https://github.com/owner/repo/compare/main...branch?title=fix this&body=base64data==";
    const result = ensureProperlyEncodedUrl(url);
    expect(result).toContain("body=base64data%3D%3D");
  });

  it("should handle query parameter with equals but no spaces (passthrough)", () => {
    const url =
      "https://github.com/owner/repo/compare/main...branch?title=test&body=a=b=c";
    // No spaces in URL, so it should pass through unchanged
    expect(ensureProperlyEncodedUrl(url)).toBe(url);
  });

  it("should not split base URL at question marks in query string", () => {
    const url =
      "https://github.com/owner/repo/compare/main...branch?title=fix this?&body=test";
    const result = ensureProperlyEncodedUrl(url);
    // The base URL should end at the first '?', not split at subsequent ones
    expect(result).toStartWith(
      "https://github.com/owner/repo/compare/main...branch?",
    );
    expect(result).toContain("title=fix+this%3F");
  });
});
