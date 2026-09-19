import { describe, expect, it } from "bun:test";
import { GITHUB_API_URL } from "../src/github/api/config";
import { buildBranchRefUrl } from "../src/mcp/git-ref-url";

describe("buildBranchRefUrl", () => {
  it("builds the refs/heads URL for a plain branch name", () => {
    expect(buildBranchRefUrl("owner", "repo", "main")).toBe(
      `${GITHUB_API_URL}/repos/owner/repo/git/refs/heads/main`,
    );
  });

  it("keeps slashes in the branch name as path separators", () => {
    expect(buildBranchRefUrl("owner", "repo", "feature/x")).toBe(
      `${GITHUB_API_URL}/repos/owner/repo/git/refs/heads/feature/x`,
    );
  });

  it("percent-encodes characters that would otherwise be parsed as a URL fragment", () => {
    const url = buildBranchRefUrl("owner", "repo", "fix/#123-description");

    expect(url).toBe(
      `${GITHUB_API_URL}/repos/owner/repo/git/refs/heads/fix/%23123-description`,
    );
    // The full branch name survives URL parsing instead of being truncated
    // to `refs/heads/fix/` with the rest dropped as a fragment.
    const parsed = new URL(url);
    expect(parsed.hash).toBe("");
    expect(
      parsed.pathname.endsWith("/git/refs/heads/fix/%23123-description"),
    ).toBe(true);
  });
});
