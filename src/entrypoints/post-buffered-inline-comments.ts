#!/usr/bin/env bun
/**
 * Reads buffered inline-comment calls from /tmp/inline-comments-buffer.jsonl,
 * classifies each as "real review" vs "test/probe" using Haiku, and posts
 * only the real ones. Calls with confirmed=false are never posted.
 *
 * If the Anthropic API is unavailable (Bedrock/Vertex users without a direct
 * key), falls back to posting everything with confirmed !== false. This
 * preserves backward compatibility — before this change, all unconfirmed
 * calls posted immediately.
 */
import { readFileSync } from "fs";
import { createOctokit } from "../github/api/client";
import { redactSecrets } from "../github/utils/sanitizer";

const BUFFER_PATH = "/tmp/inline-comments-buffer.jsonl";

// Summary line for the batched review. event=COMMENT requires a non-empty body,
// and this is what appears above the grouped inline comments on the PR.
export const REVIEW_BODY = "Claude finished reviewing this pull request.";

type BufferedComment = {
  ts: string;
  path: string;
  line?: number;
  startLine?: number;
  side?: "LEFT" | "RIGHT";
  commit_id?: string;
  body: string;
  confirmed?: boolean;
};

const CLASSIFICATION_PROMPT = `You are classifying PR inline comments as either REAL code review feedback or TEST/PROBE calls.

A TEST/PROBE call is when an automated agent is checking whether a commenting tool works. These typically:
- Start with phrases like "Test comment", "Testing if", "Can I", "Does this work", "Checking if"
- Have generic/placeholder content not specific to any code
- Exist to verify tool functionality, not to provide review feedback

A REAL review comment:
- Discusses specific code, logic, bugs, or style
- Provides actionable feedback for the PR author
- References concrete aspects of the change

For each numbered comment body below, respond with ONLY a JSON array of booleans where true = REAL review comment, false = test/probe. No other text.

Comments:
`;

async function classifyComments(bodies: string[]): Promise<boolean[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log(
      "ANTHROPIC_API_KEY not set — skipping classification, posting all unconfirmed comments",
    );
    return null;
  }

  const prompt =
    CLASSIFICATION_PROMPT +
    bodies.map((b, i) => `${i + 1}. ${JSON.stringify(b)}`).join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      console.log(
        `Classification API returned ${res.status} — posting all unconfirmed comments`,
      );
      return null;
    }

    const data = (await res.json()) as {
      content: { type: string; text: string }[];
    };
    const text = data.content.find((c) => c.type === "text")?.text ?? "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      console.log(
        "Could not parse classification response — posting all unconfirmed comments",
      );
      return null;
    }
    const parsed = JSON.parse(match[0]);
    if (
      !Array.isArray(parsed) ||
      parsed.length !== bodies.length ||
      !parsed.every((v) => typeof v === "boolean")
    ) {
      console.log(
        "Classification response shape mismatch — posting all unconfirmed comments",
      );
      return null;
    }
    return parsed;
  } catch (e) {
    console.log(
      `Classification failed (${e instanceof Error ? e.message : String(e)}) — posting all unconfirmed comments`,
    );
    return null;
  }
}

/**
 * Build the `comments[]` payload for a single batched review.
 *
 * Exported for testing: the review payload uses a different shape from
 * createReviewComment (no commit_id/pull_number per entry, and multi-line
 * hunks use start_line + line), so the mapping is worth pinning down.
 */
export function buildReviewComments(
  comments: BufferedComment[],
): Array<Record<string, unknown>> {
  return comments.map((c) => {
    const side = c.side || "RIGHT";
    const entry: Record<string, unknown> = {
      path: c.path,
      body: redactSecrets(c.body),
      side,
    };
    if (c.startLine) {
      entry.start_line = c.startLine;
      entry.start_side = side;
    }
    entry.line = c.line;
    return entry;
  });
}

/**
 * Whether a failed createReview definitively means nothing was created.
 *
 * 4xx responses (except 408/429) are request-validation failures: GitHub
 * rejected the payload and committed nothing, so replaying individually is
 * safe. Transport errors, timeouts and 5xx are ambiguous — the review may have
 * been created even though the response was lost — so those must be reconciled
 * before any replay, or duplicate comments get posted.
 */
export function isDeterministicRejection(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (typeof status !== "number") return false;
  if (status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}

/**
 * Look for a review we already created for this commit, so an ambiguous
 * failure does not cause every comment to be posted twice.
 */
async function reviewAlreadyPosted(
  octokit: ReturnType<typeof createOctokit>["rest"],
  owner: string,
  repo: string,
  pull_number: number,
  headSha: string,
): Promise<boolean> {
  const { data } = await octokit.pulls.listReviews({
    owner,
    repo,
    pull_number,
    per_page: 100,
  });
  return data.some(
    (r) => r.commit_id === headSha && (r.body ?? "").includes(REVIEW_BODY),
  );
}

async function postComment(
  octokit: ReturnType<typeof createOctokit>["rest"],
  owner: string,
  repo: string,
  pull_number: number,
  headSha: string,
  c: BufferedComment,
): Promise<boolean> {
  // octokit here is already the `.rest` client (see main), so members are
  // reached as octokit.pulls.*, matching pulls.get / createReview elsewhere in
  // this file. (@octokit/rest also self-references as .rest, so the previous
  // octokit.rest.pulls.* worked too; this is only for consistency.)
  const params: Parameters<typeof octokit.pulls.createReviewComment>[0] = {
    owner,
    repo,
    pull_number,
    body: redactSecrets(c.body),
    path: c.path,
    side: c.side || "RIGHT",
    commit_id: c.commit_id || headSha,
  };
  if (c.startLine) {
    params.start_line = c.startLine;
    params.start_side = c.side || "RIGHT";
    params.line = c.line;
  } else {
    params.line = c.line;
  }
  try {
    await octokit.pulls.createReviewComment(params);
    return true;
  } catch (e) {
    console.log(
      `  failed ${c.path}:${c.line}: ${e instanceof Error ? e.message : String(e)}`,
    );
    return false;
  }
}

export async function main() {
  let raw: string;
  try {
    raw = readFileSync(BUFFER_PATH, "utf8");
  } catch {
    console.log("No buffered inline comments");
    return;
  }

  const comments: BufferedComment[] = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  if (comments.length === 0) {
    console.log("No buffered inline comments");
    return;
  }

  console.log(`Found ${comments.length} buffered inline comment(s)`);

  const githubToken = process.env.GITHUB_TOKEN;
  const owner = process.env.REPO_OWNER;
  const repo = process.env.REPO_NAME;
  const prNumber = process.env.PR_NUMBER;

  if (!githubToken || !owner || !repo || !prNumber) {
    console.log(
      "::warning::Missing GITHUB_TOKEN/REPO_OWNER/REPO_NAME/PR_NUMBER — cannot post buffered comments",
    );
    return;
  }

  // Partition: confirmed=false are never posted; the rest are candidates
  const neverPost = comments.filter((c) => c.confirmed === false);
  const candidates = comments.filter((c) => c.confirmed !== false);

  if (neverPost.length > 0) {
    console.log(`  ${neverPost.length} with confirmed=false — not posting`);
  }

  if (candidates.length === 0) {
    return;
  }

  // Classify candidates
  const verdicts = await classifyComments(candidates.map((c) => c.body));
  const toPost =
    verdicts === null
      ? candidates
      : candidates.filter((_, i) => verdicts[i] === true);
  const filtered =
    verdicts === null ? [] : candidates.filter((_, i) => verdicts[i] === false);

  if (filtered.length > 0) {
    console.log(
      `::warning::${filtered.length} buffered comment(s) classified as test/probe — NOT posted:`,
    );
    for (const c of filtered) {
      console.log(`  [${c.path}:${c.line}] ${c.body.slice(0, 120)}`);
    }
  }

  if (toPost.length === 0) {
    console.log("No real comments to post");
    return;
  }

  const octokit = createOctokit(githubToken).rest;
  const pull_number = parseInt(prNumber, 10);
  const pr = await octokit.pulls.get({ owner, repo, pull_number });
  const headSha = pr.data.head.sha;

  console.log(`Posting ${toPost.length} classified-as-real comment(s)`);

  // Post as one review so the PR shows a single "reviewed" entry containing
  // every inline comment, rather than one standalone review per comment.
  try {
    await octokit.pulls.createReview({
      owner,
      repo,
      pull_number,
      commit_id: headSha,
      event: "COMMENT",
      // Required by the API whenever event is COMMENT: a review submitted with
      // event=COMMENT and no body is rejected with 422. The typings mark body
      // optional, so this is not caught at compile time.
      body: REVIEW_BODY,
      comments: buildReviewComments(toPost) as never,
    });
    console.log(`Posted ${toPost.length}/${toPost.length} in a single review`);
    return;
  } catch (e) {
    // createReview is atomic: one unmappable line (e.g. outside the diff, or
    // stale after a force-push) rejects the whole batch. Rather than drop every
    // comment, fall back to posting them individually — the pre-batch
    // behaviour — so partial delivery still beats none.
    //
    // But only when the failure definitively means nothing was created. A lost
    // response or a 5xx may follow a review GitHub already committed, and
    // replaying then double-posts every comment. For those, reconcile against
    // the API first and skip the replay if the review is already there.
    const message = e instanceof Error ? e.message : String(e);

    if (!isDeterministicRejection(e)) {
      let alreadyPosted: boolean;
      try {
        alreadyPosted = await reviewAlreadyPosted(
          octokit,
          owner,
          repo,
          pull_number,
          headSha,
        );
      } catch (checkError) {
        // Cannot confirm either way. Posting nothing is recoverable by re-running;
        // double-posting N comments onto a PR is not, so do not replay.
        console.log(
          `::warning::Batched review failed (${message}) and the follow-up check also failed (${checkError instanceof Error ? checkError.message : String(checkError)}) — not replaying, to avoid duplicate comments`,
        );
        return;
      }

      if (alreadyPosted) {
        console.log(
          `Batched review failed (${message}) but the review exists on the PR — not replaying`,
        );
        return;
      }
    }

    console.log(
      `::warning::Batched review failed (${message}) — falling back to individual comments`,
    );
  }

  let posted = 0;
  for (const c of toPost) {
    if (await postComment(octokit, owner, repo, pull_number, headSha, c)) {
      console.log(`  posted ${c.path}:${c.line}`);
      posted++;
    }
  }
  console.log(`Posted ${posted}/${toPost.length}`);
}

// Guarded so the module can be imported by tests without running the posting
// flow, matching the other entrypoints (prepare.ts, run.ts, ...).
if (import.meta.main) {
  main().catch((e) => {
    console.error("post-buffered-inline-comments failed:", e);
    process.exit(1);
  });
}
