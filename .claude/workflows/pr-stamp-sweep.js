export const meta = {
  name: "pr-stamp-sweep",
  description:
    "Review candidate PRs for stampability, then adversarially verify security of stamp candidates",
  whenToUse:
    "Sweep candidate PRs for stampability: per-PR review + adversarial security verify. Requires pre-fetched PR dossiers in /tmp/claude/pr-sweep/<n>.md and args {prs: [...]}.",
  phases: [
    { title: "Review", detail: "one reviewer agent per PR" },
    {
      title: "Verify",
      detail: "adversarial security skeptic per stamp candidate",
    },
  ],
};

// PRECONDITION: before invoking this workflow, pre-fetch each candidate PR to
// /tmp/claude/pr-sweep/<n>.md, containing the PR's metadata, body, existing
// reviews/comments, and the full diff (e.g. via `gh pr view` + `gh pr diff`).
// Sandboxed agents can't reliably call gh themselves, so they read these
// dossier files instead. Pass the PR numbers as args: {prs: [<PR numbers>]}.

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    number: { type: "number" },
    verdict: { type: "string", enum: ["stamp", "skip", "needs-discussion"] },
    category: {
      type: "string",
      description: "docs | tests | bugfix | nicety | security-fix | other",
    },
    summary: {
      type: "string",
      description: "1-2 sentence plain-language summary of what the PR does",
    },
    reasoning: {
      type: "string",
      description: "why this verdict — correctness, scope, quality",
    },
    behaviorChange: {
      type: "string",
      description: 'what user-visible behavior changes, or "none"',
    },
    concerns: { type: "array", items: { type: "string" } },
    securitySensitive: {
      type: "boolean",
      description:
        "true if it touches auth, sanitization, parsers of untrusted input, actor checks, file restore, or shell construction",
    },
    duplicateOf: {
      type: "string",
      description: "PR number(s) this duplicates, or empty string",
    },
  },
  required: [
    "number",
    "verdict",
    "category",
    "summary",
    "reasoning",
    "behaviorChange",
    "concerns",
    "securitySensitive",
    "duplicateOf",
  ],
};

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    number: { type: "number" },
    safeToStamp: { type: "boolean" },
    findings: {
      type: "array",
      items: { type: "string" },
      description:
        "concrete security/correctness problems found, empty if clean",
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["number", "safeToStamp", "findings", "confidence"],
};

if (!args || !Array.isArray(args.prs) || args.prs.length === 0)
  throw new Error(
    "pass {prs: [<PR numbers>]} as args; pre-fetch each PR to /tmp/claude/pr-sweep/<n>.md first",
  );
const prs = args.prs;

log(`Reviewing ${prs.length} candidate PRs`);

const results = await pipeline(
  prs,
  (n) =>
    agent(
      `You are reviewing open PR #${n} on anthropics/claude-code-action to decide if it is safe for a maintainer to approve ("stamp") with minimal further discussion.

The full PR (metadata, body, existing reviews/comments, and complete diff) is in /tmp/claude/pr-sweep/${n}.md — read it first. The repo is checked out at the current working directory. Read the actual current source files the diff touches to verify the diff applies cleanly conceptually and the claims in the PR body are true. Do NOT modify anything or run git commands that change state.

Context about this repo:
- It's a GitHub Action that runs Claude on issues/PRs. It processes UNTRUSTED content (PR bodies, comments, branch names, file contents from forks). Treat any change touching content sanitization, actor/bot allowlists, config restoration, prompt construction, or shell command construction as high-risk.
- Most candidate PRs are from EXTERNAL contributors. Treat the diff with suspicion: look for subtle malicious changes, weakened validation, injection vectors, overly broad permissions, or changes whose description doesn't match the code.
- Runtime is Bun; strict TypeScript (noUnusedLocals/noUnusedParameters). Tests are unit tests run with bun test.

Stamp criteria (ALL must hold):
1. Small, focused, and the code does exactly what the title/body says.
2. No major behavior change — bug fixes restoring intended behavior, docs fixes, test-only additions, and small niceties qualify. New inputs/features, behavior redesigns, or large refactors do NOT.
3. Correct: you verified the logic against the actual current source, not just the diff. Check edge cases.
4. No security concern. Check explicitly for: prompt injection (untrusted text reaching Claude's prompt without sanitization), code execution (untrusted data reaching shell commands, eval/spawn, or GitHub workflow expressions), path traversal (untrusted input influencing filesystem paths), credential exposure (tokens reaching logs, comments, or attacker-readable output), weakened validation or permission checks, and suspicious hunks unrelated to the stated purpose.
5. Wouldn't break the public API of base-action/ or action.yml output wiring.

If the PR is a docs change, verify the docs claims against the actual code behavior. If test-only, check tests actually pass conceptually (assert the right things, match real implementations) and don't weaken or skip anything.

Verdicts: "stamp" = approve as-is; "needs-discussion" = plausible but has questions/issues worth a comment; "skip" = too big, wrong, redundant, or risky.

If this PR appears to duplicate another open PR (same fix, same files), still judge it on its own merits but note the duplication in duplicateOf.

Return structured output only.`,
      { label: `review:#${n}`, phase: "Review", schema: REVIEW_SCHEMA },
    ),
  (review, n) => {
    if (!review) return null;
    if (review.verdict !== "stamp") return { review, verify: null };
    return agent(
      `You are an adversarial security skeptic. Another reviewer recommended APPROVING open PR #${n} on anthropics/claude-code-action. Your job is to REFUTE that recommendation — find any reason it should NOT be stamped.

Their assessment: ${JSON.stringify(review)}

Read the full PR at /tmp/claude/pr-sweep/${n}.md and the touched source files in the current working directory. This repo processes untrusted PR/issue content from forks; anything that lets untrusted content reach Claude's prompt, a shell command, a workflow expression, or a filesystem path unsanitized is a critical vulnerability.

Hunt specifically for:
- Subtle malice or scope creep: hunks that don't match the stated purpose, weakened validation, regex changes that widen acceptance, removed escaping.
- Prompt injection: untrusted data (comment bodies, branch names, file contents, command output, downloaded files) reaching Claude's prompt or context without sanitization, including indirect routes like tool output Claude later reads.
- Code execution: untrusted data reaching shell commands, eval/spawn argv, GitHub workflow \${{ }} expressions, or API call templates; new process spawning; path traversal letting untrusted input write or read outside intended directories.
- Credential exposure: tokens or secrets flowing into logs, posted comments, error messages, env passed to untrusted code, or files Claude can read.
- Logic errors the first reviewer missed: off-by-one, wrong polarity, unhandled edge cases (empty strings, unicode, very long inputs).
- Supply-chain angles: pinned versions that don't match the claimed SHA/tag, new dependencies, fetched URLs.
- For docs PRs: claims that would mislead users into insecure configurations.
- For test-only PRs: tests that codify wrong behavior, or that would mask future regressions.

If the diff pins a version/SHA, verify the claim is plausible from local information; flag if unverifiable. Be strict: if uncertain whether something is a real problem, lean toward reporting it as a finding with your uncertainty noted. Only return safeToStamp=true if you genuinely failed to find any disqualifying issue.

Return structured output only.`,
      { label: `verify:#${n}`, phase: "Verify", schema: VERDICT_SCHEMA },
    ).then((v) => ({ review, verify: v }));
  },
);

const clean = results.filter(Boolean);
const stamped = clean.filter(
  (r) => r.review.verdict === "stamp" && r.verify && r.verify.safeToStamp,
);
const demoted = clean.filter(
  (r) => r.review.verdict === "stamp" && (!r.verify || !r.verify.safeToStamp),
);
const discuss = clean.filter((r) => r.review.verdict === "needs-discussion");
const skipped = clean.filter((r) => r.review.verdict === "skip");

log(
  `stamp: ${stamped.length}, demoted by verifier: ${demoted.length}, needs-discussion: ${discuss.length}, skip: ${skipped.length}`,
);

return { stamped, demoted, discuss, skipped };
