import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { postBufferedInlineComments } from "../src/entrypoints/post-buffered-inline-comments";
import { createMockContext } from "./mockContext";

describe("postBufferedInlineComments", () => {
  let requests: { url: string; body: any; key: string | null }[];
  let spies: { mockRestore: () => void }[];
  let verdicts: boolean[];
  let dir: string;
  let bufferPath: string;
  const names = ["ALL_INPUTS", "ANTHROPIC_API_KEY"];
  const savedEnv = names.map((name) => [name, process.env[name]] as const);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "buffered-comments-"));
    bufferPath = join(dir, "buffer.jsonl");
    requests = [];
    verdicts = [true, false];
    process.env.ANTHROPIC_API_KEY = "key-from-environment";
    const answer = async (input: any, init: any) => {
      const url = String(input?.url ?? input);
      const headers = new Headers(init?.headers);
      const body = init?.body ? JSON.parse(init.body) : undefined;
      requests.push({ url, body, key: headers.get("x-api-key") });
      return Response.json(
        url.includes("/v1/messages")
          ? { content: [{ type: "text", text: JSON.stringify(verdicts) }] }
          : { id: 1, head: { sha: "head-sha" } },
      );
    };
    spies = [
      spyOn(globalThis, "fetch").mockImplementation(answer as any),
      spyOn(console, "log").mockImplementation(() => {}),
      spyOn(process.stdout, "write").mockImplementation(() => true),
    ];
    writeFileSync(
      bufferPath,
      [
        { path: "a.ts", line: 1, body: "real" },
        { path: "b.ts", line: 2, body: "test" },
        { path: "c.ts", line: 3, body: "never", confirmed: false },
      ]
        .map((comment) => JSON.stringify(comment) + "\n")
        .join(""),
    );
  });

  afterEach(() => {
    spies.forEach((spy) => spy.mockRestore());
    for (const [name, value] of savedEnv) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  const run = (isPR = true) =>
    postBufferedInlineComments({
      context: createMockContext({ isPR, entityNumber: 7 }),
      bufferPath,
      githubToken: "token",
    });
  const posted = () =>
    requests
      .filter(({ url }) => url.endsWith("/pulls/7/comments"))
      .map(({ body }) => body.path);

  test("classifies with the key from the input and posts the real ones", async () => {
    process.env.ALL_INPUTS = JSON.stringify({ anthropic_api_key: "key" });
    await run();
    expect(
      requests.filter(({ key }) => key).map(({ url, key }) => [url, key]),
    ).toEqual([["https://api.anthropic.com/v1/messages", "key"]]);
    expect(posted()).toEqual(["a.ts"]);
  });

  test("posts nothing on an issue", async () => {
    await run(false);
    expect(requests).toEqual([]);
  });

  test.each([undefined, "{}", "not JSON"])(
    "posts all candidates if the inputs are %j, without sending a key from the environment",
    async (inputs) => {
      delete process.env.ALL_INPUTS;
      if (inputs) process.env.ALL_INPUTS = inputs;
      await run();
      expect(requests.filter(({ key }) => key)).toEqual([]);
      expect(posted()).toEqual(["a.ts", "b.ts"]);
    },
  );
});
