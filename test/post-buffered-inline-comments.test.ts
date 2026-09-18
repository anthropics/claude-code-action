import { describe, test, expect } from "bun:test";
import { parseBufferedComments } from "../src/entrypoints/post-buffered-inline-comments";

describe("parseBufferedComments", () => {
  test("parses valid JSONL lines", () => {
    const raw = [
      JSON.stringify({
        ts: "2026-01-01T00:00:00Z",
        path: "src/index.ts",
        line: 10,
        body: "Consider handling the empty case.",
      }),
      JSON.stringify({
        ts: "2026-01-01T00:00:01Z",
        path: "src/util.ts",
        startLine: 5,
        line: 8,
        body: "This loop can skip the last element.",
      }),
    ].join("\n");

    const comments = parseBufferedComments(raw);
    expect(comments.length).toBe(2);
    expect(comments[0]?.path).toBe("src/index.ts");
    expect(comments[1]?.startLine).toBe(5);
  });

  test("skips a malformed line instead of throwing away valid comments", () => {
    const valid = JSON.stringify({
      ts: "2026-01-01T00:00:00Z",
      path: "src/index.ts",
      line: 10,
      body: "Real review comment.",
    });
    const truncated =
      '{"ts":"2026-01-01T00:00:01Z","path":"src/util.ts","line"';
    const raw = `${valid}\n${truncated}\n`;

    const comments = parseBufferedComments(raw);
    expect(comments.length).toBe(1);
    expect(comments[0]?.body).toBe("Real review comment.");
  });

  test("skips lines that parse to non-objects", () => {
    const valid = JSON.stringify({
      ts: "2026-01-01T00:00:00Z",
      path: "src/index.ts",
      line: 10,
      body: "Real review comment.",
    });
    const raw = `${valid}\n123\n"just a string"\n`;

    const comments = parseBufferedComments(raw);
    expect(comments.length).toBe(1);
  });

  test("returns empty array for empty or whitespace-only input", () => {
    expect(parseBufferedComments("")).toEqual([]);
    expect(parseBufferedComments("\n\n")).toEqual([]);
  });

  test("keeps comment bodies containing newlines escaped as JSON", () => {
    const raw =
      JSON.stringify({
        ts: "2026-01-01T00:00:00Z",
        path: "src/index.ts",
        line: 10,
        body: "line one\nline two",
      }) + "\n";

    const comments = parseBufferedComments(raw);
    expect(comments.length).toBe(1);
    expect(comments[0]?.body).toBe("line one\nline two");
  });
});
