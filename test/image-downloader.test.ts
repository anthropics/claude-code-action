import {
  describe,
  test,
  expect,
  spyOn,
  beforeEach,
  afterEach,
  jest,
  setSystemTime,
} from "bun:test";
import fs from "fs/promises";
import { downloadCommentImages } from "../src/github/utils/image-downloader";
import type { CommentWithImages } from "../src/github/utils/image-downloader";
import type { Octokits } from "../src/github/api/client";

describe("downloadCommentImages", () => {
  let consoleLogSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;
  let fsMkdirSpy: any;
  let fsWriteFileSpy: any;
  let fetchSpy: any;

  beforeEach(() => {
    // Spy on console methods
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});

    // Spy on fs methods
    fsMkdirSpy = spyOn(fs, "mkdir").mockResolvedValue(undefined);
    fsWriteFileSpy = spyOn(fs, "writeFile").mockResolvedValue(undefined);

    // Set fake system time for consistent filenames
    setSystemTime(new Date("2024-01-01T00:00:00.000Z")); // 1704067200000
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    fsMkdirSpy.mockRestore();
    fsWriteFileSpy.mockRestore();
    if (fetchSpy) fetchSpy.mockRestore();
    setSystemTime(); // Reset to real time
  });

  const createMockOctokit = (): Octokits => {
    return {
      rest: {
        issues: {
          getComment: jest.fn(),
          get: jest.fn(),
        },
        pulls: {
          getReviewComment: jest.fn(),
          getReview: jest.fn(),
          get: jest.fn(),
        },
      },
    } as any as Octokits;
  };

  test("should create download directory", async () => {
    const mockOctokit = createMockOctokit();
    const comments: CommentWithImages[] = [];

    await downloadCommentImages(mockOctokit, "owner", "repo", comments);

    expect(fsMkdirSpy).toHaveBeenCalledWith("/tmp/github-images", {
      recursive: true,
    });
  });

  test("should handle comments without images", async () => {
    const mockOctokit = createMockOctokit();
    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "123",
        body: "This is a comment without images",
      },
    ];

    const result = await downloadCommentImages(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(result.size).toBe(0);
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Found"),
    );
  });

  test("should detect and download images from issue comments", async () => {
    const mockOctokit = createMockOctokit();
    const imageUrl =
      "https://github.com/user-attachments/assets/test-image.png";
    const signedUrl =
      "https://private-user-images.githubusercontent.com/test.png?jwt=token";

    // Mock octokit response
    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.getComment = jest.fn().mockResolvedValue({
      data: {
        body_html: `<img src="${signedUrl}">`,
      },
    });

    // Mock fetch for image download
    const mockArrayBuffer = new ArrayBuffer(8);
    fetchSpy = spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => mockArrayBuffer,
    } as Response);

    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "123",
        body: `Here's an image: ![test](${imageUrl})`,
      },
    ];

    const result = await downloadCommentImages(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(mockOctokit.rest.issues.getComment).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      comment_id: 123,
      mediaType: { format: "full+json" },
    });

    expect(fetchSpy).toHaveBeenCalledWith(signedUrl);
    expect(fsWriteFileSpy).toHaveBeenCalledWith(
      "/tmp/github-images/image-1704067200000-0.png",
      Buffer.from(mockArrayBuffer),
    );

    expect(result.size).toBe(1);
    expect(result.get(imageUrl)).toBe(
      "/tmp/github-images/image-1704067200000-0.png",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Found 1 image(s) in issue_comment 123",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(`Downloading ${imageUrl}...`);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "✓ Saved: /tmp/github-images/image-1704067200000-0.png",
    );
  });

  test("should handle review comments", async () => {
    const mockOctokit = createMockOctokit();
    const imageUrl =
      "https://github.com/user-attachments/assets/review-image.jpg";
    const signedUrl =
      "https://private-user-images.githubusercontent.com/review.jpg?jwt=token";

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.pulls.getReviewComment = jest.fn().mockResolvedValue({
      data: {
        body_html: `<img src="${signedUrl}">`,
      },
    });

    fetchSpy = spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);

    const comments: CommentWithImages[] = [
      {
        type: "review_comment",
        id: "456",
        body: `Review comment with image: ![review](${imageUrl})`,
      },
    ];

    const result = await downloadCommentImages(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(mockOctokit.rest.pulls.getReviewComment).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      comment_id: 456,
      mediaType: { format: "full+json" },
    });

    expect(result.get(imageUrl)).toBe(
      "/tmp/github-images/image-1704067200000-0.jpg",
    );
  });

  test("should handle review bodies", async () => {
    const mockOctokit = createMockOctokit();
    const imageUrl =
      "https://github.com/user-attachments/assets/review-body.png";
    const signedUrl =
      "https://private-user-images.githubusercontent.com/body.png?jwt=token";

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.pulls.getReview = jest.fn().mockResolvedValue({
      data: {
        body_html: `<img src="${signedUrl}">`,
      },
    });

    fetchSpy = spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);

    const comments: CommentWithImages[] = [
      {
        type: "review_body",
        id: "789",
        pullNumber: "100",
        body: `Review body: ![body](${imageUrl})`,
      },
    ];

    const result = await downloadCommentImages(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(mockOctokit.rest.pulls.getReview).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      pull_number: 100,
      review_id: 789,
      mediaType: { format: "full+json" },
    });

    expect(result.get(imageUrl)).toBe(
      "/tmp/github-images/image-1704067200000-0.png",
    );
  });

  test("should handle issue bodies", async () => {
    const mockOctokit = createMockOctokit();
    const imageUrl =
      "https://github.com/user-attachments/assets/issue-body.gif";
    const signedUrl =
      "https://private-user-images.githubusercontent.com/issue.gif?jwt=token";

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.get = jest.fn().mockResolvedValue({
      data: {
        body_html: `<img src="${signedUrl}">`,
      },
    });

    fetchSpy = spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);

    const comments: CommentWithImages[] = [
      {
        type: "issue_body",
        issueNumber: "200",
        body: `Issue description: ![issue](${imageUrl})`,
      },
    ];

    const result = await downloadCommentImages(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(mockOctokit.rest.issues.get).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      issue_number: 200,
      mediaType: { format: "full+json" },
    });

    expect(result.get(imageUrl)).toBe(
      "/tmp/github-images/image-1704067200000-0.gif",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Found 1 image(s) in issue_body 200",
    );
  });

  test("should handle PR bodies", async () => {
    const mockOctokit = createMockOctokit();
    const imageUrl = "https://github.com/user-attachments/assets/pr-body.webp";
    const signedUrl =
      "https://private-user-images.githubusercontent.com/pr.webp?jwt=token";

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.pulls.get = jest.fn().mockResolvedValue({
      data: {
        body_html: `<img src="${signedUrl}">`,
      },
    });

    fetchSpy = spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);

    const comments: CommentWithImages[] = [
      {
        type: "pr_body",
        pullNumber: "300",
        body: `PR description: ![pr](${imageUrl})`,
      },
    ];

    const result = await downloadCommentImages(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      pull_number: 300,
      mediaType: { format: "full+json" },
    });

    expect(result.get(imageUrl)).toBe(
      "/tmp/github-images/image-1704067200000-0.webp",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Found 1 image(s) in pr_body 300",
    );
  });

  test("should handle multiple images in a single comment", async () => {
    const mockOctokit = createMockOctokit();
    const imageUrl1 = "https://github.com/user-attachments/assets/image1.png";
    const imageUrl2 = "https://github.com/user-attachments/assets/image2.jpg";
    const signedUrl1 =
      "https://private-user-images.githubusercontent.com/1.png?jwt=token1";
    const signedUrl2 =
      "https://private-user-images.githubusercontent.com/2.jpg?jwt=token2";

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.getComment = jest.fn().mockResolvedValue({
      data: {
        body_html: `<img src="${signedUrl1}"><img src="${signedUrl2}">`,
      },
    });

    fetchSpy = spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);

    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "999",
        body: `Two images: ![img1](${imageUrl1}) and ![img2](${imageUrl2})`,
      },
    ];

    const result = await downloadCommentImages(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.size).toBe(2);
    expect(result.get(imageUrl1)).toBe(
      "/tmp/github-images/image-1704067200000-0.png",
    );
    expect(result.get(imageUrl2)).toBe(
      "/tmp/github-images/image-1704067200000-1.jpg",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Found 2 image(s) in issue_comment 999",
    );
  });

  test("should skip already downloaded images", async () => {
    const mockOctokit = createMockOctokit();
    const imageUrl = "https://github.com/user-attachments/assets/duplicate.png";
    const signedUrl =
      "https://private-user-images.githubusercontent.com/dup.png?jwt=token";

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.getComment = jest.fn().mockResolvedValue({
      data: {
        body_html: `<img src="${signedUrl}">`,
      },
    });

    fetchSpy = spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);

    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "111",
        body: `First: ![dup](${imageUrl})`,
      },
      {
        type: "issue_comment",
        id: "222",
        body: `Second: ![dup](${imageUrl})`,
      },
    ];

    const result = await downloadCommentImages(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1); // Only downloaded once
    expect(result.size).toBe(1);
    expect(result.get(imageUrl)).toBe(
      "/tmp/github-images/image-1704067200000-0.png",
    );
  });

  test("should handle missing HTML body", async () => {
    const mockOctokit = createMockOctokit();
    const imageUrl = "https://github.com/user-attachments/assets/missing.png";

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.getComment = jest.fn().mockResolvedValue({
      data: {
        body_html: null,
      },
    });

    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "333",
        body: `Missing HTML: ![missing](${imageUrl})`,
      },
    ];

    const result = await downloadCommentImages(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(result.size).toBe(0);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "No HTML body found for issue_comment 333",
    );
  });

  test("should handle fetch errors", async () => {
    const mockOctokit = createMockOctokit();
    const imageUrl = "https://github.com/user-attachments/assets/error.png";
    const signedUrl =
      "https://private-user-images.githubusercontent.com/error.png?jwt=token";

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.getComment = jest.fn().mockResolvedValue({
      data: {
        body_html: `<img src="${signedUrl}">`,
      },
    });

    fetchSpy = spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Response);

    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "444",
        body: `Error image: ![error](${imageUrl})`,
      },
    ];

    const result = await downloadCommentImages(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(result.size).toBe(0);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `✗ Failed to download ${imageUrl}:`,
      expect.any(Error),
    );
  });

  test("should handle API errors gracefully", async () => {
    const mockOctokit = createMockOctokit();
    const imageUrl = "https://github.com/user-attachments/assets/api-error.png";

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.getComment = jest
      .fn()
      .mockRejectedValue(new Error("API rate limit exceeded"));

    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "555",
        body: `API error: ![api-error](${imageUrl})`,
      },
    ];

    const result = await downloadCommentImages(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(result.size).toBe(0);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to process images for issue_comment 555:",
      expect.any(Error),
    );
  });

  test("should extract correct file extensions", async () => {
    const mockOctokit = createMockOctokit();
    const extensions = [
      {
        url: "https://github.com/user-attachments/assets/test.png",
        ext: ".png",
      },
      {
        url: "https://github.com/user-attachments/assets/test.jpg",
        ext: ".jpg",
      },
      {
        url: "https://github.com/user-attachments/assets/test.jpeg",
        ext: ".jpeg",
      },
      {
        url: "https://github.com/user-attachments/assets/test.gif",
        ext: ".gif",
      },
      {
        url: "https://github.com/user-attachments/assets/test.webp",
        ext: ".webp",
      },
      {
        url: "https://github.com/user-attachments/assets/test.svg",
        ext: ".svg",
      },
      {
        // default
        url: "https://github.com/user-attachments/assets/no-extension",
        ext: ".png",
      },
    ];

    let callIndex = 0;
    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.getComment = jest.fn().mockResolvedValue({
      data: {
        body_html: `<img src="https://private-user-images.githubusercontent.com/test?jwt=token">`,
      },
    });

    fetchSpy = spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);

    for (const { url, ext } of extensions) {
      const comments: CommentWithImages[] = [
        {
          type: "issue_comment",
          id: `${1000 + callIndex}`,
          body: `Test: ![test](${url})`,
        },
      ];

      setSystemTime(new Date(1704067200000 + callIndex));
      const result = await downloadCommentImages(
        mockOctokit,
        "owner",
        "repo",
        comments,
      );
      expect(result.get(url)).toBe(
        `/tmp/github-images/image-${1704067200000 + callIndex}-0${ext}`,
      );

      // Reset for next iteration
      fsWriteFileSpy.mockClear();
      callIndex++;
    }
  });

  test("should handle mismatched signed URL count", async () => {
    const mockOctokit = createMockOctokit();
    const imageUrl1 = "https://github.com/user-attachments/assets/img1.png";
    const imageUrl2 = "https://github.com/user-attachments/assets/img2.png";
    const signedUrl1 =
      "https://private-user-images.githubusercontent.com/1.png?jwt=token";

    // Only one signed URL for two images
    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.getComment = jest.fn().mockResolvedValue({
      data: {
        body_html: `<img src="${signedUrl1}">`,
      },
    });

    fetchSpy = spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);

    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "666",
        body: `Two images: ![img1](${imageUrl1}) ![img2](${imageUrl2})`,
      },
    ];

    const result = await downloadCommentImages(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.size).toBe(1);
    expect(result.get(imageUrl1)).toBe(
      "/tmp/github-images/image-1704067200000-0.png",
    );
    expect(result.get(imageUrl2)).toBeUndefined();
  });

  test("should detect and download images from HTML img tags", async () => {
    const mockOctokit = createMockOctokit();
    const imageUrl =
      "https://github.com/user-attachments/assets/html-image.png";
    const signedUrl =
      "https://private-user-images.githubusercontent.com/html.png?jwt=token";

    // Mock octokit response
    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.getComment = jest.fn().mockResolvedValue({
      data: {
        body_html: `<img src="${signedUrl}">`,
      },
    });

    // Mock fetch for image download
    const mockArrayBuffer = new ArrayBuffer(8);
    fetchSpy = spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => mockArrayBuffer,
    } as Response);

    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "777",
        body: `Here's an HTML image: <img src="${imageUrl}" alt="test">`,
      },
    ];

    const result = await downloadCommentImages(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(mockOctokit.rest.issues.getComment).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      comment_id: 777,
      mediaType: { format: "full+json" },
    });

    expect(fetchSpy).toHaveBeenCalledWith(signedUrl);
    expect(fsWriteFileSpy).toHaveBeenCalledWith(
      "/tmp/github-images/image-1704067200000-0.png",
      Buffer.from(mockArrayBuffer),
    );

    expect(result.size).toBe(1);
    expect(result.get(imageUrl)).toBe(
      "/tmp/github-images/image-1704067200000-0.png",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Found 1 image(s) in issue_comment 777",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(`Downloading ${imageUrl}...`);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "✓ Saved: /tmp/github-images/image-1704067200000-0.png",
    );
  });

  test("should handle HTML img tags with different quote styles", async () => {
    const mockOctokit = createMockOctokit();
    const imageUrl1 =
      "https://github.com/user-attachments/assets/single-quote.jpg";
    const imageUrl2 =
      "https://github.com/user-attachments/assets/double-quote.png";
    const signedUrl1 =
      "https://private-user-images.githubusercontent.com/single.jpg?jwt=token1";
    const signedUrl2 =
      "https://private-user-images.githubusercontent.com/double.png?jwt=token2";

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.getComment = jest.fn().mockResolvedValue({
      data: {
        body_html: `<img src="${signedUrl1}"><img src="${signedUrl2}">`,
      },
    });

    fetchSpy = spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);

    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "888",
        body: `Single quote: <img src='${imageUrl1}' alt="test"> and double quote: <img src="${imageUrl2}" alt="test">`,
      },
    ];

    const result = await downloadCommentImages(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.size).toBe(2);
    expect(result.get(imageUrl1)).toBe(
      "/tmp/github-images/image-1704067200000-0.jpg",
    );
    expect(result.get(imageUrl2)).toBe(
      "/tmp/github-images/image-1704067200000-1.png",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Found 2 image(s) in issue_comment 888",
    );
  });

  test("should handle mixed Markdown and HTML images", async () => {
    const mockOctokit = createMockOctokit();
    const markdownUrl =
      "https://github.com/user-attachments/assets/markdown.png";
    const htmlUrl = "https://github.com/user-attachments/assets/html.jpg";
    const signedUrl1 =
      "https://private-user-images.githubusercontent.com/md.png?jwt=token1";
    const signedUrl2 =
      "https://private-user-images.githubusercontent.com/html.jpg?jwt=token2";

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.getComment = jest.fn().mockResolvedValue({
      data: {
        body_html: `<img src="${signedUrl1}"><img src="${signedUrl2}">`,
      },
    });

    fetchSpy = spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);

    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "999",
        body: `Markdown: ![test](${markdownUrl}) and HTML: <img src="${htmlUrl}" alt="test">`,
      },
    ];

    const result = await downloadCommentImages(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.size).toBe(2);
    expect(result.get(markdownUrl)).toBe(
      "/tmp/github-images/image-1704067200000-0.png",
    );
    expect(result.get(htmlUrl)).toBe(
      "/tmp/github-images/image-1704067200000-1.jpg",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Found 2 image(s) in issue_comment 999",
    );
  });

  test("should deduplicate identical URLs from Markdown and HTML", async () => {
    const mockOctokit = createMockOctokit();
    const imageUrl = "https://github.com/user-attachments/assets/duplicate.png";
    const signedUrl =
      "https://private-user-images.githubusercontent.com/dup.png?jwt=token";

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.getComment = jest.fn().mockResolvedValue({
      data: {
        body_html: `<img src="${signedUrl}">`,
      },
    });

    fetchSpy = spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);

    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "1000",
        body: `Same image twice: ![test](${imageUrl}) and <img src="${imageUrl}" alt="test">`,
      },
    ];

    const result = await downloadCommentImages(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1); // Only downloaded once
    expect(result.size).toBe(1);
    expect(result.get(imageUrl)).toBe(
      "/tmp/github-images/image-1704067200000-0.png",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Found 1 image(s) in issue_comment 1000",
    );
  });

  test("should handle HTML img tags with additional attributes", async () => {
    const mockOctokit = createMockOctokit();
    const imageUrl =
      "https://github.com/user-attachments/assets/complex-tag.webp";
    const signedUrl =
      "https://private-user-images.githubusercontent.com/complex.webp?jwt=token";

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.getComment = jest.fn().mockResolvedValue({
      data: {
        body_html: `<img src="${signedUrl}">`,
      },
    });

    fetchSpy = spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);

    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "1001",
        body: `Complex tag: <img class="image" src="${imageUrl}" alt="test image" width="100" height="200">`,
      },
    ];

    const result = await downloadCommentImages(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.size).toBe(1);
    expect(result.get(imageUrl)).toBe(
      "/tmp/github-images/image-1704067200000-0.webp",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Found 1 image(s) in issue_comment 1001",
    );
  });
});
