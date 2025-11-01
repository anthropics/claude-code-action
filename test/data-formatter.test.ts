import { expect, test, describe } from "bun:test";
import {
  formatContext,
  formatBody,
  formatComments,
  formatReviewComments,
  formatChangedFiles,
  formatChangedFilesWithSHA,
} from "../src/github/data/formatter";
import type {
  GitHubPullRequest,
  GitHubIssue,
  GitHubComment,
  GitHubFile,
} from "../src/github/types";
import type { GitHubFileWithSHA } from "../src/github/data/fetcher";

describe("formatContext", () => {
  test("formats PR context correctly", () => {
    const prData: GitHubPullRequest = {
      title: "Test PR",
      body: "PR body",
      author: { login: "test-user" },
      baseRefName: "main",
      headRefName: "feature/test",
      headRefOid: "abc123",
      createdAt: "2023-01-01T00:00:00Z",
      additions: 50,
      deletions: 30,
      state: "OPEN",
      labels: {
        nodes: [],
      },
      commits: {
        totalCount: 3,
        nodes: [],
      },
      files: {
        nodes: [{} as GitHubFile, {} as GitHubFile],
      },
      comments: {
        nodes: [],
      },
      reviews: {
        nodes: [],
      },
    };

    const result = formatContext(prData, true);
    expect(result).toBe(
      `PR Title: Test PR
PR Author: test-user
PR Branch: feature/test -> main
PR State: OPEN
PR Additions: 50
PR Deletions: 30
Total Commits: 3
Changed Files: 2 files`,
    );
  });

  test("formats Issue context correctly", () => {
    const issueData: GitHubIssue = {
      title: "Test Issue",
      body: "Issue body",
      author: { login: "test-user" },
      createdAt: "2023-01-01T00:00:00Z",
      state: "OPEN",
      labels: {
        nodes: [],
      },
      comments: {
        nodes: [],
      },
    };

    const result = formatContext(issueData, false);
    expect(result).toBe(
      `Issue Title: Test Issue
Issue Author: test-user
Issue State: OPEN`,
    );
  });
});

describe("formatBody", () => {
  test("replaces image URLs with local paths", () => {
    const body = `Here is some text with an image: ![screenshot](https://github.com/user-attachments/assets/test-image.png)
    
And another one: ![another](https://github.com/user-attachments/assets/another-image.jpg)

Some more text.`;

    const imageUrlMap = new Map([
      [
        "https://github.com/user-attachments/assets/test-image.png",
        "/tmp/github-images/image-1234-0.png",
      ],
      [
        "https://github.com/user-attachments/assets/another-image.jpg",
        "/tmp/github-images/image-1234-1.jpg",
      ],
    ]);

    const result = formatBody(body, imageUrlMap);
    expect(result)
      .toBe(`Here is some text with an image: ![](/tmp/github-images/image-1234-0.png)
    
And another one: ![](/tmp/github-images/image-1234-1.jpg)

Some more text.`);
  });

  test("handles empty image map", () => {
    const body = "No images here";
    const imageUrlMap = new Map<string, string>();

    const result = formatBody(body, imageUrlMap);
    expect(result).toBe("No images here");
  });

  test("preserves body when no images match", () => {
    const body = "![image](https://example.com/image.png)";
    const imageUrlMap = new Map([
      [
        "https://github.com/user-attachments/assets/different.png",
        "/tmp/github-images/image-1234-0.png",
      ],
    ]);

    const result = formatBody(body, imageUrlMap);
    expect(result).toBe("![](https://example.com/image.png)");
  });

  test("handles multiple occurrences of same image", () => {
    const body = `First: ![img](https://github.com/user-attachments/assets/test.png)
Second: ![img](https://github.com/user-attachments/assets/test.png)`;

    const imageUrlMap = new Map([
      [
        "https://github.com/user-attachments/assets/test.png",
        "/tmp/github-images/image-1234-0.png",
      ],
    ]);

    const result = formatBody(body, imageUrlMap);
    expect(result).toBe(`First: ![](/tmp/github-images/image-1234-0.png)
Second: ![](/tmp/github-images/image-1234-0.png)`);
  });
});

describe("formatComments", () => {
  test("formats comments correctly", () => {
    const comments: GitHubComment[] = [
      {
        id: "1",
        databaseId: "100001",
        body: "First comment",
        author: { login: "user1" },
        createdAt: "2023-01-01T00:00:00Z",
      },
      {
        id: "2",
        databaseId: "100002",
        body: "Second comment",
        author: { login: "user2" },
        createdAt: "2023-01-02T00:00:00Z",
      },
    ];

    const result = formatComments(comments);
    expect(result).toBe(
      `[user1 at 2023-01-01T00:00:00Z]: First comment\n\n[user2 at 2023-01-02T00:00:00Z]: Second comment`,
    );
  });

  test("returns empty string for empty comments array", () => {
    const result = formatComments([]);
    expect(result).toBe("");
  });

  test("replaces image URLs in comments", () => {
    const comments: GitHubComment[] = [
      {
        id: "1",
        databaseId: "100001",
        body: "Check out this screenshot: ![screenshot](https://github.com/user-attachments/assets/screenshot.png)",
        author: { login: "user1" },
        createdAt: "2023-01-01T00:00:00Z",
      },
      {
        id: "2",
        databaseId: "100002",
        body: "Here's another image: ![bug](https://github.com/user-attachments/assets/bug-report.jpg)",
        author: { login: "user2" },
        createdAt: "2023-01-02T00:00:00Z",
      },
    ];

    const imageUrlMap = new Map([
      [
        "https://github.com/user-attachments/assets/screenshot.png",
        "/tmp/github-images/image-1234-0.png",
      ],
      [
        "https://github.com/user-attachments/assets/bug-report.jpg",
        "/tmp/github-images/image-1234-1.jpg",
      ],
    ]);

    const result = formatComments(comments, imageUrlMap);
    expect(result).toBe(
      `[user1 at 2023-01-01T00:00:00Z]: Check out this screenshot: ![](/tmp/github-images/image-1234-0.png)\n\n[user2 at 2023-01-02T00:00:00Z]: Here's another image: ![](/tmp/github-images/image-1234-1.jpg)`,
    );
  });

  test("handles comments with multiple images", () => {
    const comments: GitHubComment[] = [
      {
        id: "1",
        databaseId: "100001",
        body: "Two images: ![first](https://github.com/user-attachments/assets/first.png) and ![second](https://github.com/user-attachments/assets/second.png)",
        author: { login: "user1" },
        createdAt: "2023-01-01T00:00:00Z",
      },
    ];

    const imageUrlMap = new Map([
      [
        "https://github.com/user-attachments/assets/first.png",
        "/tmp/github-images/image-1234-0.png",
      ],
      [
        "https://github.com/user-attachments/assets/second.png",
        "/tmp/github-images/image-1234-1.png",
      ],
    ]);

    const result = formatComments(comments, imageUrlMap);
    expect(result).toBe(
      `[user1 at 2023-01-01T00:00:00Z]: Two images: ![](/tmp/github-images/image-1234-0.png) and ![](/tmp/github-images/image-1234-1.png)`,
    );
  });

  test("preserves comments when imageUrlMap is undefined", () => {
    const comments: GitHubComment[] = [
      {
        id: "1",
        databaseId: "100001",
        body: "Image: ![test](https://github.com/user-attachments/assets/test.png)",
        author: { login: "user1" },
        createdAt: "2023-01-01T00:00:00Z",
      },
    ];

    const result = formatComments(comments);
    expect(result).toBe(
      `[user1 at 2023-01-01T00:00:00Z]: Image: ![](https://github.com/user-attachments/assets/test.png)`,
    );
  });

  test("filters out minimized comments", () => {
    const comments: GitHubComment[] = [
      {
        id: "1",
        databaseId: "100001",
        body: "Normal comment",
        author: { login: "user1" },
        createdAt: "2023-01-01T00:00:00Z",
        isMinimized: false,
      },
      {
        id: "2",
        databaseId: "100002",
        body: "Minimized comment",
        author: { login: "user2" },
        createdAt: "2023-01-02T00:00:00Z",
        isMinimized: true,
      },
      {
        id: "3",
        databaseId: "100003",
        body: "Another normal comment",
        author: { login: "user3" },
        createdAt: "2023-01-03T00:00:00Z",
      },
    ];

    const result = formatComments(comments);
    expect(result).toBe(
      `[user1 at 2023-01-01T00:00:00Z]: Normal comment\n\n[user3 at 2023-01-03T00:00:00Z]: Another normal comment`,
    );
  });

  test("returns empty string when all comments are minimized", () => {
    const comments: GitHubComment[] = [
      {
        id: "1",
        databaseId: "100001",
        body: "Minimized comment 1",
        author: { login: "user1" },
        createdAt: "2023-01-01T00:00:00Z",
        isMinimized: true,
      },
      {
        id: "2",
        databaseId: "100002",
        body: "Minimized comment 2",
        author: { login: "user2" },
        createdAt: "2023-01-02T00:00:00Z",
        isMinimized: true,
      },
    ];

    const result = formatComments(comments);
    expect(result).toBe("");
  });
});

describe("formatReviewComments", () => {
  test("formats review with body and comments correctly", () => {
    const reviewData = {
      nodes: [
        {
          id: "review1",
          databaseId: "300001",
          author: { login: "reviewer1" },
          body: "This is a great PR! LGTM.",
          state: "APPROVED",
          submittedAt: "2023-01-01T00:00:00Z",
          comments: {
            nodes: [
              {
                id: "comment1",
                databaseId: "200001",
                body: "Nice implementation",
                author: { login: "reviewer1" },
                createdAt: "2023-01-01T00:00:00Z",
                path: "src/index.ts",
                line: 42,
              },
              {
                id: "comment2",
                databaseId: "200002",
                body: "Consider adding error handling",
                author: { login: "reviewer1" },
                createdAt: "2023-01-01T00:00:00Z",
                path: "src/utils.ts",
                line: null,
              },
            ],
          },
        },
      ],
    };

    const result = formatReviewComments(reviewData);
    expect(result).toBe(
      `[Review by reviewer1 at 2023-01-01T00:00:00Z]: APPROVED\nThis is a great PR! LGTM.\n  [Comment on src/index.ts:42]: Nice implementation\n  [Comment on src/utils.ts:?]: Consider adding error handling`,
    );
  });

  test("formats review with only body (no comments) correctly", () => {
    const reviewData = {
      nodes: [
        {
          id: "review1",
          databaseId: "300002",
          author: { login: "reviewer1" },
          body: "Looks good to me!",
          state: "APPROVED",
          submittedAt: "2023-01-01T00:00:00Z",
          comments: {
            nodes: [],
          },
        },
      ],
    };

    const result = formatReviewComments(reviewData);
    expect(result).toBe(
      `[Review by reviewer1 at 2023-01-01T00:00:00Z]: APPROVED\nLooks good to me!`,
    );
  });

  test("formats review without body correctly", () => {
    const reviewData = {
      nodes: [
        {
          id: "review1",
          databaseId: "300003",
          author: { login: "reviewer1" },
          body: "",
          state: "COMMENTED",
          submittedAt: "2023-01-01T00:00:00Z",
          comments: {
            nodes: [
              {
                id: "comment1",
                databaseId: "200003",
                body: "Small suggestion here",
                author: { login: "reviewer1" },
                createdAt: "2023-01-01T00:00:00Z",
                path: "src/main.ts",
                line: 15,
              },
            ],
          },
        },
      ],
    };

    const result = formatReviewComments(reviewData);
    expect(result).toBe(
      `[Review by reviewer1 at 2023-01-01T00:00:00Z]: COMMENTED\n  [Comment on src/main.ts:15]: Small suggestion here`,
    );
  });

  test("formats multiple reviews correctly", () => {
    const reviewData = {
      nodes: [
        {
          id: "review1",
          databaseId: "300004",
          author: { login: "reviewer1" },
          body: "Needs changes",
          state: "CHANGES_REQUESTED",
          submittedAt: "2023-01-01T00:00:00Z",
          comments: {
            nodes: [],
          },
        },
        {
          id: "review2",
          databaseId: "300005",
          author: { login: "reviewer2" },
          body: "LGTM",
          state: "APPROVED",
          submittedAt: "2023-01-02T00:00:00Z",
          comments: {
            nodes: [],
          },
        },
      ],
    };

    const result = formatReviewComments(reviewData);
    expect(result).toBe(
      `[Review by reviewer1 at 2023-01-01T00:00:00Z]: CHANGES_REQUESTED\nNeeds changes\n\n[Review by reviewer2 at 2023-01-02T00:00:00Z]: APPROVED\nLGTM`,
    );
  });

  test("returns empty string for null reviewData", () => {
    const result = formatReviewComments(null);
    expect(result).toBe("");
  });

  test("returns empty string for empty reviewData", () => {
    const result = formatReviewComments({ nodes: [] });
    expect(result).toBe("");
  });

  test("replaces image URLs in review comments", () => {
    const reviewData = {
      nodes: [
        {
          id: "review1",
          databaseId: "300001",
          author: { login: "reviewer1" },
          body: "Review with image: ![review-img](https://github.com/user-attachments/assets/review.png)",
          state: "APPROVED",
          submittedAt: "2023-01-01T00:00:00Z",
          comments: {
            nodes: [
              {
                id: "comment1",
                databaseId: "200001",
                body: "Comment with image: ![comment-img](https://github.com/user-attachments/assets/comment.png)",
                author: { login: "reviewer1" },
                createdAt: "2023-01-01T00:00:00Z",
                path: "src/index.ts",
                line: 42,
              },
            ],
          },
        },
      ],
    };

    const imageUrlMap = new Map([
      [
        "https://github.com/user-attachments/assets/review.png",
        "/tmp/github-images/image-1234-0.png",
      ],
      [
        "https://github.com/user-attachments/assets/comment.png",
        "/tmp/github-images/image-1234-1.png",
      ],
    ]);

    const result = formatReviewComments(reviewData, imageUrlMap);
    expect(result).toBe(
      `[Review by reviewer1 at 2023-01-01T00:00:00Z]: APPROVED\nReview with image: ![](/tmp/github-images/image-1234-0.png)\n  [Comment on src/index.ts:42]: Comment with image: ![](/tmp/github-images/image-1234-1.png)`,
    );
  });

  test("handles multiple images in review comments", () => {
    const reviewData = {
      nodes: [
        {
          id: "review1",
          databaseId: "300001",
          author: { login: "reviewer1" },
          body: "Good work",
          state: "APPROVED",
          submittedAt: "2023-01-01T00:00:00Z",
          comments: {
            nodes: [
              {
                id: "comment1",
                databaseId: "200001",
                body: "Two issues: ![issue1](https://github.com/user-attachments/assets/issue1.png) and ![issue2](https://github.com/user-attachments/assets/issue2.png)",
                author: { login: "reviewer1" },
                createdAt: "2023-01-01T00:00:00Z",
                path: "src/main.ts",
                line: 15,
              },
            ],
          },
        },
      ],
    };

    const imageUrlMap = new Map([
      [
        "https://github.com/user-attachments/assets/issue1.png",
        "/tmp/github-images/image-1234-0.png",
      ],
      [
        "https://github.com/user-attachments/assets/issue2.png",
        "/tmp/github-images/image-1234-1.png",
      ],
    ]);

    const result = formatReviewComments(reviewData, imageUrlMap);
    expect(result).toBe(
      `[Review by reviewer1 at 2023-01-01T00:00:00Z]: APPROVED\nGood work\n  [Comment on src/main.ts:15]: Two issues: ![](/tmp/github-images/image-1234-0.png) and ![](/tmp/github-images/image-1234-1.png)`,
    );
  });

  test("preserves review comments when imageUrlMap is undefined", () => {
    const reviewData = {
      nodes: [
        {
          id: "review1",
          databaseId: "300001",
          author: { login: "reviewer1" },
          body: "Review body",
          state: "APPROVED",
          submittedAt: "2023-01-01T00:00:00Z",
          comments: {
            nodes: [
              {
                id: "comment1",
                databaseId: "200001",
                body: "Image: ![test](https://github.com/user-attachments/assets/test.png)",
                author: { login: "reviewer1" },
                createdAt: "2023-01-01T00:00:00Z",
                path: "src/index.ts",
                line: 42,
              },
            ],
          },
        },
      ],
    };

    const result = formatReviewComments(reviewData);
    expect(result).toBe(
      `[Review by reviewer1 at 2023-01-01T00:00:00Z]: APPROVED\nReview body\n  [Comment on src/index.ts:42]: Image: ![](https://github.com/user-attachments/assets/test.png)`,
    );
  });

  test("filters out minimized review comments", () => {
    const reviewData = {
      nodes: [
        {
          id: "review1",
          databaseId: "300001",
          author: { login: "reviewer1" },
          body: "Review with mixed comments",
          state: "APPROVED",
          submittedAt: "2023-01-01T00:00:00Z",
          comments: {
            nodes: [
              {
                id: "comment1",
                databaseId: "200001",
                body: "Normal review comment",
                author: { login: "reviewer1" },
                createdAt: "2023-01-01T00:00:00Z",
                path: "src/index.ts",
                line: 42,
                isMinimized: false,
              },
              {
                id: "comment2",
                databaseId: "200002",
                body: "Minimized review comment",
                author: { login: "reviewer1" },
                createdAt: "2023-01-01T00:00:00Z",
                path: "src/utils.ts",
                line: 15,
                isMinimized: true,
              },
              {
                id: "comment3",
                databaseId: "200003",
                body: "Another normal comment",
                author: { login: "reviewer1" },
                createdAt: "2023-01-01T00:00:00Z",
                path: "src/main.ts",
                line: 10,
              },
            ],
          },
        },
      ],
    };

    const result = formatReviewComments(reviewData);
    expect(result).toBe(
      `[Review by reviewer1 at 2023-01-01T00:00:00Z]: APPROVED\nReview with mixed comments\n  [Comment on src/index.ts:42]: Normal review comment\n  [Comment on src/main.ts:10]: Another normal comment`,
    );
  });

  test("returns review with only body when all review comments are minimized", () => {
    const reviewData = {
      nodes: [
        {
          id: "review1",
          databaseId: "300001",
          author: { login: "reviewer1" },
          body: "Review body only",
          state: "APPROVED",
          submittedAt: "2023-01-01T00:00:00Z",
          comments: {
            nodes: [
              {
                id: "comment1",
                databaseId: "200001",
                body: "Minimized comment 1",
                author: { login: "reviewer1" },
                createdAt: "2023-01-01T00:00:00Z",
                path: "src/index.ts",
                line: 42,
                isMinimized: true,
              },
              {
                id: "comment2",
                databaseId: "200002",
                body: "Minimized comment 2",
                author: { login: "reviewer1" },
                createdAt: "2023-01-01T00:00:00Z",
                path: "src/utils.ts",
                line: 15,
                isMinimized: true,
              },
            ],
          },
        },
      ],
    };

    const result = formatReviewComments(reviewData);
    expect(result).toBe(
      `[Review by reviewer1 at 2023-01-01T00:00:00Z]: APPROVED\nReview body only`,
    );
  });

  test("handles multiple reviews with mixed minimized comments", () => {
    const reviewData = {
      nodes: [
        {
          id: "review1",
          databaseId: "300001",
          author: { login: "reviewer1" },
          body: "First review",
          state: "APPROVED",
          submittedAt: "2023-01-01T00:00:00Z",
          comments: {
            nodes: [
              {
                id: "comment1",
                databaseId: "200001",
                body: "Good comment",
                author: { login: "reviewer1" },
                createdAt: "2023-01-01T00:00:00Z",
                path: "src/index.ts",
                line: 42,
                isMinimized: false,
              },
            ],
          },
        },
        {
          id: "review2",
          databaseId: "300002",
          author: { login: "reviewer2" },
          body: "Second review",
          state: "COMMENTED",
          submittedAt: "2023-01-02T00:00:00Z",
          comments: {
            nodes: [
              {
                id: "comment2",
                databaseId: "200002",
                body: "Spam comment",
                author: { login: "reviewer2" },
                createdAt: "2023-01-02T00:00:00Z",
                path: "src/utils.ts",
                line: 15,
                isMinimized: true,
              },
            ],
          },
        },
      ],
    };

    const result = formatReviewComments(reviewData);
    expect(result).toBe(
      `[Review by reviewer1 at 2023-01-01T00:00:00Z]: APPROVED\nFirst review\n  [Comment on src/index.ts:42]: Good comment\n\n[Review by reviewer2 at 2023-01-02T00:00:00Z]: COMMENTED\nSecond review`,
    );
  });
});

describe("formatChangedFiles", () => {
  test("formats changed files correctly", () => {
    const files: GitHubFile[] = [
      {
        path: "src/index.ts",
        additions: 10,
        deletions: 5,
        changeType: "MODIFIED",
      },
      {
        path: "src/utils.ts",
        additions: 20,
        deletions: 0,
        changeType: "ADDED",
      },
    ];

    const result = formatChangedFiles(files);
    expect(result).toBe(
      `- src/index.ts (MODIFIED) +10/-5\n- src/utils.ts (ADDED) +20/-0`,
    );
  });

  test("returns empty string for empty files array", () => {
    const result = formatChangedFiles([]);
    expect(result).toBe("");
  });
});

describe("formatChangedFilesWithSHA", () => {
  test("formats changed files with SHA correctly", () => {
    const files: GitHubFileWithSHA[] = [
      {
        path: "src/index.ts",
        additions: 10,
        deletions: 5,
        changeType: "MODIFIED",
        sha: "abc123",
      },
      {
        path: "src/utils.ts",
        additions: 20,
        deletions: 0,
        changeType: "ADDED",
        sha: "def456",
      },
    ];

    const result = formatChangedFilesWithSHA(files);
    expect(result).toBe(
      `- src/index.ts (MODIFIED) +10/-5 SHA: abc123\n- src/utils.ts (ADDED) +20/-0 SHA: def456`,
    );
  });

  test("returns empty string for empty files array", () => {
    const result = formatChangedFilesWithSHA([]);
    expect(result).toBe("");
  });
});
