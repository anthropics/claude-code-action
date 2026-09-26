import { describe, expect, it } from "bun:test";
import { GITHUB_API_URL } from "../src/github/api/config";
import { updateGitReference } from "../src/mcp/update-git-reference";

const reference = {
  owner: "owner",
  repo: "repo",
  branch: "feature",
  sha: "abc123",
  githubToken: "token",
};

function response(status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => "response body",
  };
}

describe("updateGitReference", () => {
  it("should patch the branch reference", async () => {
    await updateGitReference({
      ...reference,
      fetchFn: async (url, init) => {
        expect(url).toBe(
          `${GITHUB_API_URL}/repos/owner/repo/git/refs/heads/feature`,
        );
        expect(init.method).toBe("PATCH");
        expect(init.headers).toMatchObject({ Authorization: "Bearer token" });
        expect(JSON.parse(String(init.body))).toEqual({
          sha: "abc123",
          force: false,
        });
        return response(200);
      },
    });
  });

  it("should not retry deterministic client errors", async () => {
    for (const status of [400, 404, 409, 422]) {
      let attempts = 0;

      await expect(
        updateGitReference({
          ...reference,
          fetchFn: async () => {
            attempts++;
            return response(status);
          },
          retryOptions: { initialDelayMs: 1 },
        }),
      ).rejects.toThrow(`Failed to update reference: ${status}`);

      expect(attempts).toBe(1);
    }
  });

  it("should retry transient HTTP errors", async () => {
    for (const status of [403, 429, 500]) {
      let attempts = 0;

      await updateGitReference({
        ...reference,
        fetchFn: async () => response(attempts++ === 0 ? status : 200),
        retryOptions: { initialDelayMs: 1 },
      });

      expect(attempts).toBe(2);
    }
  });

  it("should retry network errors", async () => {
    let attempts = 0;

    await updateGitReference({
      ...reference,
      fetchFn: async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error("network error");
        }
        return response(200);
      },
      retryOptions: { initialDelayMs: 1 },
    });

    expect(attempts).toBe(2);
  });
});
