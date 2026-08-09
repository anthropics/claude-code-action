import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  getInlineCommentBufferPath,
  removeBufferedComment,
} from "../src/mcp/inline-comment-buffer";

describe("removeBufferedComment", () => {
  let dir: string;
  let bufferPath: string;

  const entryA = {
    ts: "2026-06-13T00:00:00.000Z",
    path: "src/index.ts",
    line: 10,
    startLine: undefined,
    side: "RIGHT",
    body: "Comment A",
  };
  const entryB = {
    ts: "2026-06-13T00:00:01.000Z",
    path: "src/other.ts",
    line: 20,
    startLine: undefined,
    side: "RIGHT",
    body: "Comment B",
  };

  const writeBuffer = (entries: object[]): void => {
    writeFileSync(
      bufferPath,
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );
  };

  const readBuffer = (): Array<{ body: string }> => {
    if (!existsSync(bufferPath)) {
      return [];
    }
    return readFileSync(bufferPath, "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line));
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "inline-buffer-"));
    bufferPath = join(dir, "buffer.jsonl");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("removes the matching buffered entry and keeps the others", () => {
    writeBuffer([entryA, entryB]);

    removeBufferedComment(
      {
        path: "src/index.ts",
        line: 10,
        startLine: undefined,
        body: "Comment A",
      },
      bufferPath,
    );

    const remaining = readBuffer();
    expect(remaining.map((e) => e.body)).toEqual(["Comment B"]);
  });

  it("removes every copy when the same comment was buffered more than once", () => {
    writeBuffer([entryA, entryA, entryB]);

    removeBufferedComment(
      {
        path: "src/index.ts",
        line: 10,
        startLine: undefined,
        body: "Comment A",
      },
      bufferPath,
    );

    expect(readBuffer().map((e) => e.body)).toEqual(["Comment B"]);
  });

  it("leaves the buffer untouched when nothing matches", () => {
    writeBuffer([entryA, entryB]);

    removeBufferedComment(
      {
        path: "src/index.ts",
        line: 999,
        startLine: undefined,
        body: "Comment A",
      },
      bufferPath,
    );

    expect(readBuffer().map((e) => e.body)).toEqual(["Comment A", "Comment B"]);
  });

  it("does nothing when the buffer file does not exist", () => {
    expect(() =>
      removeBufferedComment(
        { path: "src/index.ts", line: 10, body: "Comment A" },
        bufferPath,
      ),
    ).not.toThrow();
    expect(existsSync(bufferPath)).toBe(false);
  });

  it("keeps lines that cannot be parsed as JSON", () => {
    writeFileSync(
      bufferPath,
      ["not json", JSON.stringify(entryA)].join("\n") + "\n",
    );

    removeBufferedComment(
      {
        path: "src/index.ts",
        line: 10,
        startLine: undefined,
        body: "Comment A",
      },
      bufferPath,
    );

    const raw = readFileSync(bufferPath, "utf8");
    expect(raw).toContain("not json");
    expect(raw).not.toContain("Comment A");
  });
});

describe("getInlineCommentBufferPath", () => {
  const originalRunnerTemp = process.env.RUNNER_TEMP;

  afterEach(() => {
    if (originalRunnerTemp === undefined) {
      delete process.env.RUNNER_TEMP;
    } else {
      process.env.RUNNER_TEMP = originalRunnerTemp;
    }
  });

  it("scopes the buffer to RUNNER_TEMP so it cannot leak between jobs", () => {
    process.env.RUNNER_TEMP = join(tmpdir(), "runner-temp-job-1");

    expect(getInlineCommentBufferPath()).toBe(
      join(process.env.RUNNER_TEMP, "inline-comments-buffer.jsonl"),
    );
  });

  it("returns a different path for a different job on the same machine", () => {
    process.env.RUNNER_TEMP = join(tmpdir(), "runner-temp-job-1");
    const first = getInlineCommentBufferPath();

    process.env.RUNNER_TEMP = join(tmpdir(), "runner-temp-job-2");
    const second = getInlineCommentBufferPath();

    expect(first).not.toBe(second);
  });

  it("falls back to the OS temp dir outside Actions", () => {
    delete process.env.RUNNER_TEMP;

    expect(getInlineCommentBufferPath()).toBe(
      join(tmpdir(), "inline-comments-buffer.jsonl"),
    );
  });

  it("resolves identically for the writer and the reader in one job", () => {
    process.env.RUNNER_TEMP = join(tmpdir(), "runner-temp-job-1");

    // The MCP server writes the buffer and the post step reads it, in separate
    // processes that share the job environment. Both must agree on the path.
    expect(getInlineCommentBufferPath()).toBe(getInlineCommentBufferPath());
  });

  it("is not the fixed /tmp path that leaked across runs", () => {
    process.env.RUNNER_TEMP = join(tmpdir(), "runner-temp-job-1");

    expect(getInlineCommentBufferPath()).not.toBe(
      "/tmp/inline-comments-buffer.jsonl",
    );
  });
});
