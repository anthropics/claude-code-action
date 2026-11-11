import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import {
  classifyComments,
  postComment,
} from "../src/entrypoints/post-buffered-inline-comments";

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

let consoleLogSpy: ReturnType<typeof spyOn<typeof console, "log">>;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

function mockFetchResponse(options: {
  ok: boolean;
  status?: number;
  body?: unknown;
}) {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue({
    ok: options.ok,
    status: options.status ?? (options.ok ? 200 : 500),
    json: async () => options.body,
  } as unknown as Response);
}

function textResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

beforeEach(() => {
  consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  consoleLogSpy.mockRestore();
  fetchSpy?.mockRestore();
  if (ORIGINAL_KEY === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  }
});

describe("classifyComments", () => {
  test("returns null and logs when ANTHROPIC_API_KEY is absent", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await classifyComments(["a"]);

    expect(result).toBeNull();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "ANTHROPIC_API_KEY not set — skipping classification, posting all unconfirmed comments",
    );
  });

  test("calls the Anthropic API and returns the parsed verdicts", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    mockFetchResponse({ ok: true, body: textResponse("[true, false]") });

    const result = await classifyComments(["real review", "test probe"]);

    expect(result).toEqual([true, false]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-test");
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe("claude-haiku-4-5");
    expect(sent.max_tokens).toBe(1024);
    expect(sent.messages).toHaveLength(1);
    expect(sent.messages[0].role).toBe("user");
    // The prompt must keep the instruction header and the newline-numbered
    // body list (kills the prompt-construction mutants).
    expect(sent.messages[0].content).toContain(
      "You are classifying PR inline comments",
    );
    expect(sent.messages[0].content).toContain(
      '1. "real review"\n2. "test probe"',
    );
  });

  test("uses the text content block even when it is not the first block", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          { type: "thinking", text: "ignore me" },
          { type: "text", text: "[true]" },
        ],
      }),
    } as unknown as Response);

    const result = await classifyComments(["a"]);

    expect(result).toEqual([true]);
  });

  test("returns null when there is no text content block", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    mockFetchResponse({ ok: true, body: { content: [{ type: "image" }] } });

    const result = await classifyComments(["a"]);

    expect(result).toBeNull();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Could not parse classification response — posting all unconfirmed comments",
    );
  });

  test("extracts the JSON array even when wrapped in prose", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    mockFetchResponse({
      ok: true,
      body: textResponse("Sure! Here you go: [false, true] done"),
    });

    const result = await classifyComments(["a", "b"]);

    expect(result).toEqual([false, true]);
  });

  test("returns null and logs the status when the API responds not-ok", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    mockFetchResponse({ ok: false, status: 429 });

    const result = await classifyComments(["a"]);

    expect(result).toBeNull();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Classification API returned 429 — posting all unconfirmed comments",
    );
  });

  test("returns null when the response has no JSON array", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    mockFetchResponse({ ok: true, body: textResponse("no array here") });

    const result = await classifyComments(["a"]);

    expect(result).toBeNull();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Could not parse classification response — posting all unconfirmed comments",
    );
  });

  test("returns null when the array length does not match the input", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    mockFetchResponse({ ok: true, body: textResponse("[true]") });

    const result = await classifyComments(["a", "b"]);

    expect(result).toBeNull();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Classification response shape mismatch — posting all unconfirmed comments",
    );
  });

  test("returns null when the array has a non-boolean element", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    mockFetchResponse({ ok: true, body: textResponse('[true, "nope"]') });

    const result = await classifyComments(["a", "b"]);

    expect(result).toBeNull();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Classification response shape mismatch — posting all unconfirmed comments",
    );
  });

  test("returns null and logs when fetch throws", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("network down"),
    );

    const result = await classifyComments(["a"]);

    expect(result).toBeNull();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Classification failed (network down) — posting all unconfirmed comments",
    );
  });
});

describe("postComment", () => {
  function makeOctokit(options?: { fail?: boolean }) {
    const createReviewComment = mock(async () => {
      if (options?.fail) {
        throw new Error("422 unprocessable");
      }
      return { data: { id: 1 } };
    });
    const octokit = {
      rest: { pulls: { createReviewComment } },
    } as never;
    return { octokit, createReviewComment };
  }

  test("posts a single-line comment with default side and head sha", async () => {
    const { octokit, createReviewComment } = makeOctokit();

    const ok = await postComment(octokit, "o", "r", 7, "headsha", {
      ts: "t",
      path: "src/a.ts",
      line: 10,
      body: "looks wrong",
    });

    expect(ok).toBe(true);
    const arg = (
      createReviewComment.mock.calls as unknown as Array<
        [Record<string, unknown>]
      >
    )[0]![0];
    expect(arg).toMatchObject({
      owner: "o",
      repo: "r",
      pull_number: 7,
      body: "looks wrong",
      path: "src/a.ts",
      side: "RIGHT",
      commit_id: "headsha",
      line: 10,
    });
    expect("start_line" in arg).toBe(false);
  });

  test("posts a multi-line comment when startLine is set", async () => {
    const { octokit, createReviewComment } = makeOctokit();

    const ok = await postComment(octokit, "o", "r", 7, "headsha", {
      ts: "t",
      path: "src/a.ts",
      startLine: 5,
      line: 10,
      side: "LEFT",
      commit_id: "abc",
      body: "range comment",
    });

    expect(ok).toBe(true);
    const arg = (
      createReviewComment.mock.calls as unknown as Array<
        [Record<string, unknown>]
      >
    )[0]![0];
    expect(arg).toMatchObject({
      start_line: 5,
      start_side: "LEFT",
      line: 10,
      side: "LEFT",
      commit_id: "abc",
    });
  });

  test("multi-line comment without an explicit side defaults to RIGHT", async () => {
    const { octokit, createReviewComment } = makeOctokit();

    const ok = await postComment(octokit, "o", "r", 7, "headsha", {
      ts: "t",
      path: "src/a.ts",
      startLine: 5,
      line: 10,
      body: "range comment",
    });

    expect(ok).toBe(true);
    const arg = (
      createReviewComment.mock.calls as unknown as Array<
        [Record<string, unknown>]
      >
    )[0]![0];
    expect(arg.side).toBe("RIGHT");
    expect(arg.start_side).toBe("RIGHT");
  });

  test("returns false and logs when the API call fails", async () => {
    const { octokit } = makeOctokit({ fail: true });

    const ok = await postComment(octokit, "o", "r", 7, "headsha", {
      ts: "t",
      path: "src/a.ts",
      line: 10,
      body: "x",
    });

    expect(ok).toBe(false);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "  failed src/a.ts:10: 422 unprocessable",
    );
  });
});
