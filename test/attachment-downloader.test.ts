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
import { downloadCommentAttachments } from "../src/github/utils/attachment-downloader";
import type { CommentWithImages } from "../src/github/utils/image-downloader";
import type { Octokits } from "../src/github/api/client";

describe("downloadCommentAttachments", () => {
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

    await downloadCommentAttachments(mockOctokit, "owner", "repo", comments);

    expect(fsMkdirSpy).toHaveBeenCalledWith("/tmp/github-attachments", {
      recursive: true,
    });
  });

  test("should handle comments without attachments", async () => {
    const mockOctokit = createMockOctokit();
    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "123",
        body: "This is a comment without attachments",
      },
    ];

    const result = await downloadCommentAttachments(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(result.attachments.size).toBe(0);
    expect(result.summary.total).toBe(0);
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

    const result = await downloadCommentAttachments(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(result.attachments.size).toBe(1);
    const attachment = result.attachments.get(imageUrl);
    expect(attachment?.type).toBe("image");
    expect(attachment?.localPath).toBe(
      "/tmp/github-attachments/image-1704067200000-0.png",
    );
    expect(attachment?.fileSize).toBe(8);
    expect(attachment?.error).toBeUndefined();

    expect(result.summary.total).toBe(1);
    expect(result.summary.successful).toBe(1);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.byType.image).toBe(1);
  });

  test("should detect img tag format", async () => {
    const mockOctokit = createMockOctokit();
    const imageUrl =
      "https://github.com/user-attachments/assets/test-image.jpg";
    const signedUrl =
      "https://private-user-images.githubusercontent.com/test.jpg?jwt=token";

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
        id: "123",
        body: `Here's an image: <img src="${imageUrl}" alt="test">`,
      },
    ];

    const result = await downloadCommentAttachments(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(result.attachments.size).toBe(1);
    const attachment = result.attachments.get(imageUrl);
    expect(attachment?.type).toBe("image");
    expect(attachment?.localPath).toBe(
      "/tmp/github-attachments/image-1704067200000-0.jpg",
    );
  });

  test("should handle PDF documents", async () => {
    const mockOctokit = createMockOctokit();
    const pdfUrl = "https://github.com/user-attachments/files/document.pdf";
    const signedUrl =
      "https://private-user-images.githubusercontent.com/doc.pdf?jwt=token";

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.getComment = jest.fn().mockResolvedValue({
      data: {
        body_html: `<a href="${signedUrl}">document.pdf</a>`,
      },
    });

    fetchSpy = spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1024),
    } as Response);

    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "123",
        body: `Document: [document.pdf](${pdfUrl})`,
      },
    ];

    const result = await downloadCommentAttachments(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(result.attachments.size).toBe(1);
    const attachment = result.attachments.get(pdfUrl);
    expect(attachment?.type).toBe("document");
    expect(attachment?.localPath).toBe(
      "/tmp/github-attachments/document-1704067200000-0.pdf",
    );
    expect(attachment?.fileSize).toBe(1024);
  });

  test("should handle text files", async () => {
    const mockOctokit = createMockOctokit();
    const csvUrl = "https://github.com/user-attachments/files/data.csv";
    const signedUrl =
      "https://private-user-images.githubusercontent.com/data.csv?jwt=token";

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.getComment = jest.fn().mockResolvedValue({
      data: {
        body_html: `<a href="${signedUrl}">data.csv</a>`,
      },
    });

    const csvContent = "name,age\nJohn,30\nJane,25";
    fetchSpy = spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode(csvContent).buffer,
    } as Response);

    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "123",
        body: `Data: [data.csv](${csvUrl})`,
      },
    ];

    const result = await downloadCommentAttachments(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(result.attachments.size).toBe(1);
    const attachment = result.attachments.get(csvUrl);
    expect(attachment?.type).toBe("text");
    expect(attachment?.localPath).toBe(
      "/tmp/github-attachments/text-1704067200000-0.csv",
    );
  });

  test("should handle video files (metadata only)", async () => {
    const mockOctokit = createMockOctokit();
    const videoUrl = "https://github.com/user-attachments/assets/video.mp4";

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.getComment = jest.fn().mockResolvedValue({
      data: {
        body_html: `<a href="https://private-user-images.githubusercontent.com/video.mp4?jwt=token">video.mp4</a>`,
      },
    });

    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "123",
        body: `Video: [video.mp4](${videoUrl})`,
      },
    ];

    const result = await downloadCommentAttachments(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(result.attachments.size).toBe(1);
    const attachment = result.attachments.get(videoUrl);
    expect(attachment?.type).toBe("video");
    expect(attachment?.downloadSkipped).toBe(true);
    expect(attachment?.localPath).toBeUndefined();
    expect(result.summary.skipped).toBe(1);
  });

  test("should handle multiple file types in single comment", async () => {
    const mockOctokit = createMockOctokit();
    const imageUrl = "https://github.com/user-attachments/assets/image.png";
    const pdfUrl = "https://github.com/user-attachments/files/doc.pdf";
    const videoUrl = "https://github.com/user-attachments/assets/video.mp4";

    const signedUrl1 =
      "https://private-user-images.githubusercontent.com/img.png?jwt=token1";
    const signedUrl2 =
      "https://private-user-images.githubusercontent.com/doc.pdf?jwt=token2";
    const signedUrl3 =
      "https://private-user-images.githubusercontent.com/video.mp4?jwt=token3";

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.getComment = jest.fn().mockResolvedValue({
      data: {
        body_html: `<img src="${signedUrl1}"><a href="${signedUrl2}">doc.pdf</a><a href="${signedUrl3}">video.mp4</a>`,
      },
    });

    fetchSpy = spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(512),
    } as Response);

    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "123",
        body: `Mixed: ![img](${imageUrl}) [doc.pdf](${pdfUrl}) [video.mp4](${videoUrl})`,
      },
    ];

    const result = await downloadCommentAttachments(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(result.attachments.size).toBe(3);
    expect(result.summary.total).toBe(3);
    expect(result.summary.successful).toBe(2); // image and document
    expect(result.summary.skipped).toBe(1); // video
    expect(result.summary.byType.image).toBe(1);
    expect(result.summary.byType.document).toBe(1);
    expect(result.summary.byType.video).toBe(1);
  });

  test("should handle unsupported file types", async () => {
    const mockOctokit = createMockOctokit();
    const unknownUrl = "https://github.com/user-attachments/files/file.xyz";

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.getComment = jest.fn().mockResolvedValue({
      data: {
        body_html: `<a href="https://private-user-images.githubusercontent.com/file.xyz?jwt=token">file.xyz</a>`,
      },
    });

    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "123",
        body: `Unknown: [file.xyz](${unknownUrl})`,
      },
    ];

    const result = await downloadCommentAttachments(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(result.attachments.size).toBe(1);
    const attachment = result.attachments.get(unknownUrl);
    expect(attachment?.type).toBe("unknown");
    expect(attachment?.error).toContain("Unsupported file type");
    expect(result.summary.failed).toBe(1);
  });

  test("should handle file size limits", async () => {
    const mockOctokit = createMockOctokit();
    const imageUrl = "https://github.com/user-attachments/assets/large.png";
    const signedUrl =
      "https://private-user-images.githubusercontent.com/large.png?jwt=token";

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.getComment = jest.fn().mockResolvedValue({
      data: {
        body_html: `<img src="${signedUrl}">`,
      },
    });

    // Mock a file larger than 10MB (image limit)
    const largeBuffer = new ArrayBuffer(15 * 1024 * 1024); // 15MB
    fetchSpy = spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => largeBuffer,
    } as Response);

    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "123",
        body: `Large image: ![large](${imageUrl})`,
      },
    ];

    const result = await downloadCommentAttachments(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(result.attachments.size).toBe(1);
    const attachment = result.attachments.get(imageUrl);
    expect(attachment?.type).toBe("image");
    expect(attachment?.error).toContain("exceeds limit");
    expect(result.summary.failed).toBe(1);
  });

  test("should skip already processed URLs", async () => {
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

    const result = await downloadCommentAttachments(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1); // Only downloaded once
    expect(result.attachments.size).toBe(1);
    expect(result.summary.successful).toBe(1);
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

    const result = await downloadCommentAttachments(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(result.attachments.size).toBe(1);
    const attachment = result.attachments.get(imageUrl);
    expect(attachment?.type).toBe("image");
    expect(attachment?.error).toContain("HTTP 404");
    expect(result.summary.failed).toBe(1);
  });

  test("should generate correct summary", async () => {
    const mockOctokit = createMockOctokit();
    const imageUrl = "https://github.com/user-attachments/assets/success.png";
    const videoUrl = "https://github.com/user-attachments/assets/video.mp4";
    const unknownUrl = "https://github.com/user-attachments/files/unknown.xyz";

    const signedUrl1 =
      "https://private-user-images.githubusercontent.com/success.png?jwt=token1";
    const signedUrl2 =
      "https://private-user-images.githubusercontent.com/video.mp4?jwt=token2";
    const signedUrl3 =
      "https://private-user-images.githubusercontent.com/unknown.xyz?jwt=token3";

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.getComment = jest.fn().mockResolvedValue({
      data: {
        body_html: `<img src="${signedUrl1}"><a href="${signedUrl2}">video.mp4</a><a href="${signedUrl3}">unknown.xyz</a>`,
      },
    });

    fetchSpy = spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);

    const comments: CommentWithImages[] = [
      {
        type: "issue_comment",
        id: "123",
        body: `Mixed: ![img](${imageUrl}) [video.mp4](${videoUrl}) [unknown.xyz](${unknownUrl})`,
      },
    ];

    const result = await downloadCommentAttachments(
      mockOctokit,
      "owner",
      "repo",
      comments,
    );

    expect(result.summary.total).toBe(3);
    expect(result.summary.successful).toBe(1); // image
    expect(result.summary.failed).toBe(1); // unknown
    expect(result.summary.skipped).toBe(1); // video
    expect(result.summary.byType).toEqual({
      image: 1,
      video: 1,
      unknown: 1,
    });
  });
});
