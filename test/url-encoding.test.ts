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

  it("should keep an equals sign inside a parameter value", () => {
    const url =
      "https://github.com/owner/repo/compare/main...branch?quick_pull=1&title=fix: retry&body=Sets timeout=30 for retries";
    const expected =
      "https://github.com/owner/repo/compare/main...branch?quick_pull=1&title=fix%3A+retry&body=Sets+timeout%3D30+for+retries";
    expect(ensureProperlyEncodedUrl(url)).toBe(expected);
  });

  it("should keep a question mark inside a parameter value", () => {
    const url =
      "https://github.com/owner/repo/compare/main...branch?quick_pull=1&title=fix: retry&body=Does this work? Yes it does";
    const expected =
      "https://github.com/owner/repo/compare/main...branch?quick_pull=1&title=fix%3A+retry&body=Does+this+work%3F+Yes+it+does";
    expect(ensureProperlyEncodedUrl(url)).toBe(expected);
  });

  it("should encode a literal percent sign in a parameter value", () => {
    const url =
      "https://github.com/owner/repo/compare/main...branch?quick_pull=1&title=fix: retry&body=Cuts CPU use by 100% on idle";
    const expected =
      "https://github.com/owner/repo/compare/main...branch?quick_pull=1&title=fix%3A+retry&body=Cuts+CPU+use+by+100%25+on+idle";
    expect(ensureProperlyEncodedUrl(url)).toBe(expected);
  });

  it("should decode existing escapes next to a literal percent sign", () => {
    const url =
      "https://github.com/owner/repo/compare/main...branch?quick_pull=1&title=fix%3A retry&body=100% of a%3Db cases";
    const expected =
      "https://github.com/owner/repo/compare/main...branch?quick_pull=1&title=fix%3A+retry&body=100%25+of+a%3Db+cases";
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
});
