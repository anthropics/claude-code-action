import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import fs from "fs/promises";
import { fetchGitHubData } from "../src/github/data/fetcher";
import { downloadCommentImages } from "../src/github/utils/image-downloader";
import type { CommentWithImages } from "../src/github/utils/image-downloader";
import type { Octokits } from "../src/github/api/client";

const GUID = "0b0c9d33-4e6a-4f4e-8a1a-2f9e5c6d7e8f";
const BODY = `Text\n![a](https://github.com/user-attachments/assets/${GUID})`;

describe("images in text fetched again from GitHub", () => {
  let spies: { mockRestore(): void }[];
  let warn: ReturnType<typeof spyOn>;

  beforeEach(() => {
    warn = spyOn(console, "warn").mockImplementation(() => {});
    spies = [
      warn,
      spyOn(console, "log").mockImplementation(() => {}),
      spyOn(fs, "mkdir").mockResolvedValue(undefined),
      spyOn(fs, "writeFile").mockResolvedValue(undefined),
      spyOn(global, "fetch").mockImplementation(
        (async () => new Response("image")) as any,
      ),
    ];
  });

  afterEach(() => spies.forEach((spy) => spy.mockRestore()));

  const HTML = `<img src="https://private-user-images.githubusercontent.com/1/2-${GUID}.png?jwt=t">`;

  const countDownloads = async (
    comments: CommentWithImages[],
    bodyOnGitHub: string | null | undefined,
    htmlOnGitHub: string | null = HTML,
  ) => {
    const get = async () => ({
      data: { body: bodyOnGitHub, body_html: htmlOnGitHub },
    });
    const octokits = {
      rest: {
        issues: { get, getComment: get },
        pulls: { get, getReview: get, getReviewComment: get },
      },
    };
    const result = await downloadCommentImages(
      octokits as any as Octokits,
      "owner",
      "repo",
      comments,
    );
    return result.size;
  };

  const issueBody = (body: string): CommentWithImages => ({
    type: "issue_body",
    issueNumber: "1",
    body,
  });

  test.each<CommentWithImages>([
    issueBody(BODY),
    { type: "pr_body", pullNumber: "1", body: BODY },
    { type: "issue_comment", id: "1", body: BODY },
    { type: "review_comment", id: "1", body: BODY },
    { type: "review_body", id: "1", pullNumber: "1", body: BODY },
  ])("are skipped when the text of $type has changed", async (comment) => {
    expect(await countDownloads([comment], `${BODY}\nMore text`)).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(`Skipping images in ${comment.type} 1:`),
    );
  });

  test("are skipped when GitHub returns no text", async () => {
    expect(await countDownloads([issueBody(BODY)], null, null)).toBe(0);
    expect(await countDownloads([issueBody(BODY)], undefined)).toBe(0);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Skipping images in issue_body 1:"),
    );
  });

  test("are downloaded when only the line endings differ", async () => {
    const withCrlf = BODY.replaceAll("\n", "\r\n");
    expect(await countDownloads([issueBody(BODY)], withCrlf)).toBe(1);
    expect(await countDownloads([issueBody(withCrlf)], BODY)).toBe(1);
  });

  test("are still downloaded from a comment after a skipped description", async () => {
    const comments: CommentWithImages[] = [
      issueBody(`Older text\n${BODY}`),
      { type: "issue_comment", id: "2", body: BODY },
    ];
    expect(await countDownloads(comments, BODY)).toBe(1);
  });

  test.each([
    { case: "unedited", current: BODY, images: 1 },
    { case: "edited", current: `${BODY}\nMore text`, images: 0 },
  ])(
    "use the description from the event when it is $case",
    async ({ current, images }) => {
      const get = async () => ({ data: { body: current, body_html: HTML } });
      const result = await fetchGitHubData({
        octokits: {
          graphql: async () => ({
            repository: {
              issue: {
                title: "Issue",
                body: current,
                author: { login: "author" },
                createdAt: "2024-01-15T10:00:00Z",
                state: "OPEN",
                labels: { nodes: [] },
                comments: { nodes: [] },
              },
            },
            user: { login: "trigger-user" },
          }),
          rest: { issues: { get } },
        } as any,
        repository: "owner/repo",
        prNumber: "1",
        isPR: false,
        triggerUsername: "trigger-user",
        triggerTime: "2024-01-15T12:00:00Z",
        originalBody: BODY,
      });
      expect(result.contextData.body).toBe(BODY);
      expect(result.imageUrlMap.size).toBe(images);
    },
  );
});
