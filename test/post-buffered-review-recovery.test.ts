import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Regression cover for the error-after-success case on the batched review.
 *
 * `pulls.createReview` can fail with the write already applied — a dropped
 * response, a proxy 502, a timeout. Replaying the comments individually then
 * posts every one of them a second time. These drive main() with a stubbed
 * Octokit and assert on whether the per-comment path runs.
 */

const BUFFER_PATH = "/tmp/inline-comments-buffer.jsonl";

type Calls = {
  createReview: number;
  createReviewComment: number;
  listReviews: number;
};

function installOctokitStub(opts: {
  createReviewError?: unknown;
  existingReviews?: Array<{ commit_id: string; body: string }>;
  listReviewsError?: unknown;
}): Calls {
  const calls: Calls = {
    createReview: 0,
    createReviewComment: 0,
    listReviews: 0,
  };

  const rest = {
    pulls: {
      get: async () => ({ data: { head: { sha: "headsha" } } }),
      createReview: async () => {
        calls.createReview++;
        if (opts.createReviewError) throw opts.createReviewError;
        return { data: {} };
      },
      listReviews: async () => {
        calls.listReviews++;
        if (opts.listReviewsError) throw opts.listReviewsError;
        return { data: opts.existingReviews ?? [] };
      },
      createReviewComment: async () => {
        calls.createReviewComment++;
        return { data: {} };
      },
    },
  };

  mock.module("../src/github/api/client", () => ({
    createOctokit: () => ({ rest }),
  }));

  return calls;
}

async function runMain(): Promise<void> {
  // Fresh module instance each time so the stub above is picked up.
  const mod = await import(
    `../src/entrypoints/post-buffered-inline-comments?t=${Date.now()}${Math.random()}`
  );
  await mod.main();
}

describe("batched review: error-after-success handling", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "buffered-"));
    process.env.GITHUB_TOKEN = "t";
    process.env.REPO_OWNER = "o";
    process.env.REPO_NAME = "r";
    process.env.PR_NUMBER = "1";
    delete process.env.ANTHROPIC_API_KEY; // skip classification
    writeFileSync(
      BUFFER_PATH,
      [
        JSON.stringify({ ts: "t", path: "a.ts", line: 1, body: "real one" }),
        JSON.stringify({ ts: "t", path: "b.ts", line: 2, body: "real two" }),
      ].join("\n") + "\n",
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(BUFFER_PATH, { force: true });
  });

  it("does not replay when the response was lost but the review exists", async () => {
    const calls = installOctokitStub({
      createReviewError: new Error("socket hang up"),
      existingReviews: [
        {
          commit_id: "headsha",
          body: "Claude finished reviewing this pull request.",
        },
      ],
    });

    await runMain();

    expect(calls.createReview).toBe(1);
    expect(calls.listReviews).toBe(1);
    // The comments are already on the PR inside that review.
    expect(calls.createReviewComment).toBe(0);
  });

  it("replays when an ambiguous failure left no review behind", async () => {
    const calls = installOctokitStub({
      createReviewError: Object.assign(new Error("bad gateway"), {
        status: 502,
      }),
      existingReviews: [],
    });

    await runMain();

    expect(calls.listReviews).toBe(1);
    expect(calls.createReviewComment).toBe(2);
  });

  it("replays immediately on a deterministic rejection without an extra lookup", async () => {
    const calls = installOctokitStub({
      createReviewError: Object.assign(new Error("unprocessable"), {
        status: 422,
      }),
    });

    await runMain();

    // 422 means nothing was created, so no reconciliation is needed.
    expect(calls.listReviews).toBe(0);
    expect(calls.createReviewComment).toBe(2);
  });

  it("does not replay when the reconciliation lookup itself fails", async () => {
    const calls = installOctokitStub({
      createReviewError: new Error("socket hang up"),
      listReviewsError: new Error("also down"),
    });

    await runMain();

    // Unknown state: posting nothing can be retried, double-posting cannot.
    expect(calls.createReviewComment).toBe(0);
  });

  it("posts exactly one review and no individual comments on success", async () => {
    const calls = installOctokitStub({});

    await runMain();

    expect(calls.createReview).toBe(1);
    expect(calls.createReviewComment).toBe(0);
    expect(calls.listReviews).toBe(0);
  });
});
