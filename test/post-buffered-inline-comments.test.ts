#!/usr/bin/env bun

/**
 * Tests for the buffered inline-comment post step.
 *
 * The entrypoint had no coverage: a malformed buffer line threw out of main()
 * and the always() step exited non-zero, discarding every valid comment along
 * with the bad one. These cover the parse guard that replaced it, plus the
 * confirmed=false partition and the classification fallback paths, which
 * decide whether a comment reaches the PR at all.
 */

import { describe, test, expect, spyOn, beforeEach, afterEach } from "bun:test";
import {
  parseBufferedComments,
  partitionByConfirmed,
  applyVerdicts,
  classifyComments,
  type BufferedComment,
} from "../src/entrypoints/post-buffered-inline-comments";

function entry(overrides: Partial<BufferedComment> = {}): BufferedComment {
  return {
    ts: "2026-01-01T00:00:00.000Z",
    path: "src/index.ts",
    line: 10,
    body: "This allocates inside the loop.",
    ...overrides,
  };
}

function jsonl(...entries: BufferedComment[]): string {
  return entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

describe("parseBufferedComments", () => {
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test("parses well-formed JSONL", () => {
    const raw = jsonl(entry({ path: "a.ts" }), entry({ path: "b.ts" }));
    const parsed = parseBufferedComments(raw);
    expect(parsed.map((c) => c.path)).toEqual(["a.ts", "b.ts"]);
  });

  test("returns an empty list for empty input", () => {
    expect(parseBufferedComments("")).toEqual([]);
    expect(parseBufferedComments("\n\n")).toEqual([]);
  });

  test("ignores blank and whitespace-only lines", () => {
    const raw = `${JSON.stringify(entry())}\n\n   \n${JSON.stringify(entry())}\n`;
    expect(parseBufferedComments(raw)).toHaveLength(2);
  });

  test("skips a malformed line and keeps the valid ones", () => {
    // The regression this guards: previously the whole step threw here.
    const raw = [
      JSON.stringify(entry({ path: "first.ts" })),
      "{not valid json",
      JSON.stringify(entry({ path: "third.ts" })),
    ].join("\n");

    const parsed = parseBufferedComments(raw);
    expect(parsed.map((c) => c.path)).toEqual(["first.ts", "third.ts"]);
  });

  test("survives a truncated final line", () => {
    // A process killed mid-append leaves exactly this shape.
    const raw =
      JSON.stringify(entry({ path: "complete.ts" })) +
      "\n" +
      '{"ts":"2026-01-01T00:00:00.000Z","path":"trunc';

    const parsed = parseBufferedComments(raw);
    expect(parsed.map((c) => c.path)).toEqual(["complete.ts"]);
  });

  test("warns with the line number of the malformed entry", () => {
    const raw = [
      JSON.stringify(entry()),
      JSON.stringify(entry()),
      "}}garbage",
    ].join("\n");

    parseBufferedComments(raw);

    const warnings = (logSpy.mock.calls as unknown[][])
      .map((args) => String(args[0]))
      .filter((msg: string) => msg.includes("Skipping malformed"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("line 3");
  });

  test("returns an empty list when every line is malformed", () => {
    expect(parseBufferedComments("nope\nalso nope\n")).toEqual([]);
  });

  test("preserves every field needed to build the API call", () => {
    const original = entry({
      startLine: 4,
      line: 9,
      side: "LEFT",
      commit_id: "abc123",
      confirmed: true,
    });
    const [parsed] = parseBufferedComments(jsonl(original));
    expect(parsed).toEqual(original);
  });
});

describe("partitionByConfirmed", () => {
  test("confirmed=false is never posted", () => {
    const blocked = entry({ confirmed: false, path: "blocked.ts" });
    const { neverPost, candidates } = partitionByConfirmed([blocked]);
    expect(neverPost).toEqual([blocked]);
    expect(candidates).toEqual([]);
  });

  test("confirmed=true is a candidate", () => {
    const c = entry({ confirmed: true });
    expect(partitionByConfirmed([c]).candidates).toEqual([c]);
  });

  test("an absent confirmed flag is a candidate", () => {
    // The buffered-by-default case: no flag means classify, not discard.
    const c = entry();
    expect(partitionByConfirmed([c]).candidates).toEqual([c]);
  });

  test("splits a mixed set", () => {
    const yes = entry({ confirmed: true, path: "yes.ts" });
    const no = entry({ confirmed: false, path: "no.ts" });
    const maybe = entry({ path: "maybe.ts" });

    const { neverPost, candidates } = partitionByConfirmed([yes, no, maybe]);
    expect(neverPost.map((c) => c.path)).toEqual(["no.ts"]);
    expect(candidates.map((c) => c.path)).toEqual(["yes.ts", "maybe.ts"]);
  });
});

describe("applyVerdicts", () => {
  const a = entry({ path: "a.ts" });
  const b = entry({ path: "b.ts" });

  test("null verdicts post everything", () => {
    // Classification unavailable (no API key, or the request failed) must fall
    // back to the pre-buffering behaviour of posting all candidates.
    const { toPost, filtered } = applyVerdicts([a, b], null);
    expect(toPost).toEqual([a, b]);
    expect(filtered).toEqual([]);
  });

  test("splits by verdict", () => {
    const { toPost, filtered } = applyVerdicts([a, b], [true, false]);
    expect(toPost).toEqual([a]);
    expect(filtered).toEqual([b]);
  });

  test("all-true posts everything", () => {
    expect(applyVerdicts([a, b], [true, true]).toPost).toEqual([a, b]);
  });

  test("all-false posts nothing", () => {
    const { toPost, filtered } = applyVerdicts([a, b], [false, false]);
    expect(toPost).toEqual([]);
    expect(filtered).toEqual([a, b]);
  });

  test("handles an empty candidate list", () => {
    expect(applyVerdicts([], [])).toEqual({ toPost: [], filtered: [] });
  });
});

describe("classifyComments", () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.ANTHROPIC_API_KEY;
  let logSpy: ReturnType<typeof spyOn>;

  // Cast through unknown: only the handful of Response fields classifyComments
  // reads are stubbed, and Bun's `typeof fetch` carries extras (preconnect)
  // that a bare arrow function cannot satisfy.
  function stubFetch(impl: () => Promise<unknown>) {
    globalThis.fetch = impl as unknown as typeof fetch;
  }

  function mockFetch(response: unknown, ok = true, status = 200) {
    stubFetch(async () => ({ ok, status, json: async () => response }));
  }

  function anthropicText(text: string) {
    return { content: [{ type: "text", text }] };
  }

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    logSpy.mockRestore();
    if (originalKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  test("returns null when no API key is configured", async () => {
    // Bedrock/Vertex users have no direct key; everything must still post.
    delete process.env.ANTHROPIC_API_KEY;
    expect(await classifyComments(["anything"])).toBeNull();
  });

  test("parses a well-formed verdict array", async () => {
    mockFetch(anthropicText("[true, false]"));
    expect(await classifyComments(["real", "test probe"])).toEqual([
      true,
      false,
    ]);
  });

  test("tolerates prose around the JSON array", async () => {
    mockFetch(anthropicText("Here you go:\n[true]\nHope that helps."));
    expect(await classifyComments(["real"])).toEqual([true]);
  });

  test("returns null on a non-ok response", async () => {
    mockFetch({}, false, 429);
    expect(await classifyComments(["a"])).toBeNull();
  });

  test("returns null when the response contains no array", async () => {
    mockFetch(anthropicText("I could not decide."));
    expect(await classifyComments(["a"])).toBeNull();
  });

  test("returns null when the array length does not match the input", async () => {
    // A short array would otherwise silently drop the trailing comments.
    mockFetch(anthropicText("[true]"));
    expect(await classifyComments(["a", "b"])).toBeNull();
  });

  test("returns null when the array holds non-booleans", async () => {
    mockFetch(anthropicText('["yes", "no"]'));
    expect(await classifyComments(["a", "b"])).toBeNull();
  });

  test("returns null when the request throws", async () => {
    stubFetch(async () => {
      throw new Error("network down");
    });
    expect(await classifyComments(["a"])).toBeNull();
  });

  test("every failure mode is recoverable, never thrown", async () => {
    // classifyComments is called from an always() step; a throw here would
    // fail the step and lose the comments it was meant to protect.
    mockFetch({}, false, 500);
    await expect(classifyComments(["a"])).resolves.toBeNull();
  });
});
