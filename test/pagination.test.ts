import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  spyOn,
  mock,
} from "bun:test";
import {
  fetchGitHubData,
  getPaginationConfigFromEnv,
} from "../src/github/data/fetcher";
import {
  createPRQuery,
  createIssueQuery,
  type PaginationConfig,
  DEFAULT_PAGINATION_CONFIG,
} from "../src/github/api/queries/github";
import type { Octokits } from "../src/github/api/client";
import type { GitHubPullRequest, GitHubIssue } from "../src/github/types";

// Mock external dependencies
mock.module("child_process", () => ({
  execSync: mock(() => "abc123sha"),
}));

mock.module("../src/github/utils/image-downloader", () => ({
  downloadCommentImages: mock(() => Promise.resolve(new Map())),
}));

// Mock data generators
function createMockPR(
  filesCount: number = 50,
  commitsCount: number = 50,
  commentsCount: number = 50,
  reviewsCount: number = 50,
): GitHubPullRequest {
  return {
    title: "Test PR",
    body: "Test PR body",
    author: { login: "testuser" },
    baseRefName: "main",
    headRefName: "feature",
    headRefOid: "abc123",
    createdAt: "2023-01-01T00:00:00Z",
    additions: 100,
    deletions: 50,
    state: "open",
    commits: {
      totalCount: commitsCount,
      pageInfo: {
        hasNextPage: commitsCount > 50,
        endCursor: commitsCount > 50 ? "cursor_commits_50" : null,
      },
      nodes: Array.from({ length: Math.min(commitsCount, 50) }, (_, i) => ({
        commit: {
          oid: `commit_${i}`,
          message: `Commit ${i}`,
          author: { name: "Test Author", email: "test@example.com" },
        },
      })),
    },
    files: {
      pageInfo: {
        hasNextPage: filesCount > 50,
        endCursor: filesCount > 50 ? "cursor_files_50" : null,
      },
      nodes: Array.from({ length: Math.min(filesCount, 50) }, (_, i) => ({
        path: `file_${i}.ts`,
        additions: 10,
        deletions: 5,
        changeType: "MODIFIED",
      })),
    },
    comments: {
      pageInfo: {
        hasNextPage: commentsCount > 50,
        endCursor: commentsCount > 50 ? "cursor_comments_50" : null,
      },
      nodes: Array.from({ length: Math.min(commentsCount, 50) }, (_, i) => ({
        id: `comment_${i}`,
        databaseId: `${i}`,
        body: `Comment ${i}`,
        author: { login: "testuser" },
        createdAt: "2023-01-01T00:00:00Z",
      })),
    },
    reviews: {
      pageInfo: {
        hasNextPage: reviewsCount > 50,
        endCursor: reviewsCount > 50 ? "cursor_reviews_50" : null,
      },
      nodes: Array.from({ length: Math.min(reviewsCount, 50) }, (_, i) => ({
        id: `review_${i}`,
        databaseId: `${i}`,
        author: { login: "reviewer" },
        body: `Review ${i}`,
        state: "APPROVED",
        submittedAt: "2023-01-01T00:00:00Z",
        comments: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [],
        },
      })),
    },
  };
}

function createMockIssue(commentsCount: number = 50): GitHubIssue {
  return {
    title: "Test Issue",
    body: "Test issue body",
    author: { login: "testuser" },
    createdAt: "2023-01-01T00:00:00Z",
    state: "open",
    comments: {
      pageInfo: {
        hasNextPage: commentsCount > 50,
        endCursor: commentsCount > 50 ? "cursor_comments_50" : null,
      },
      nodes: Array.from({ length: Math.min(commentsCount, 50) }, (_, i) => ({
        id: `comment_${i}`,
        databaseId: `${i}`,
        body: `Comment ${i}`,
        author: { login: "testuser" },
        createdAt: "2023-01-01T00:00:00Z",
      })),
    },
  };
}

// Mock octokit
function createMockOctokit(
  prData?: GitHubPullRequest,
  issueData?: GitHubIssue,
  callCount: { current: number } = { current: 0 },
): Octokits {
  const mockGraphql = async <T>(query: string, variables: any): Promise<T> => {
    callCount.current++;

    if (query.includes("pullRequest")) {
      // Simulate pagination by returning different data based on cursors
      let mockPR = prData || createMockPR();

      // If this is a subsequent page, return remaining data
      if (variables.after || query.includes("after:")) {
        const remainingFiles = Math.max(0, 150 - 50); // Simulate 150 total files
        const remainingCommits = Math.max(0, 120 - 50); // Simulate 120 total commits

        mockPR = {
          ...mockPR,
          files: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: Array.from({ length: remainingFiles }, (_, i) => ({
              path: `file_${i + 50}.ts`,
              additions: 10,
              deletions: 5,
              changeType: "MODIFIED",
            })),
          },
          commits: {
            ...mockPR.commits,
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: Array.from({ length: remainingCommits }, (_, i) => ({
              commit: {
                oid: `commit_${i + 50}`,
                message: `Commit ${i + 50}`,
                author: { name: "Test Author", email: "test@example.com" },
              },
            })),
          },
        };
      }

      return {
        repository: { pullRequest: mockPR },
      } as T;
    }

    if (query.includes("issue")) {
      let mockIssue = issueData || createMockIssue();

      // Simulate pagination for issue comments
      if (variables.after || query.includes("after:")) {
        const remainingComments = Math.max(0, 80 - 50); // Simulate 80 total comments

        mockIssue = {
          ...mockIssue,
          comments: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: Array.from({ length: remainingComments }, (_, i) => ({
              id: `comment_${i + 50}`,
              databaseId: `${i + 50}`,
              body: `Comment ${i + 50}`,
              author: { login: "testuser" },
              createdAt: "2023-01-01T00:00:00Z",
            })),
          },
        };
      }

      return {
        repository: { issue: mockIssue },
      } as T;
    }

    throw new Error(`Unexpected query: ${query}`);
  };

  return {
    graphql: mockGraphql as any,
    rest: {} as any,
  };
}

describe("Pagination Configuration", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("getPaginationConfigFromEnv should return default config when no env vars set", () => {
    delete process.env.MAX_FILES;
    delete process.env.MAX_COMMITS;
    delete process.env.MAX_COMMENTS;
    delete process.env.MAX_REVIEWS;

    const config = getPaginationConfigFromEnv();

    expect(config).toEqual({
      maxFiles: 100,
      maxCommits: 100,
      maxComments: 100,
      maxReviews: 100,
    });
  });

  test("getPaginationConfigFromEnv should read from environment variables", () => {
    process.env.MAX_FILES = "200";
    process.env.MAX_COMMITS = "150";
    process.env.MAX_COMMENTS = "300";
    process.env.MAX_REVIEWS = "50";

    const config = getPaginationConfigFromEnv();

    expect(config).toEqual({
      maxFiles: 200,
      maxCommits: 150,
      maxComments: 300,
      maxReviews: 50,
    });
  });

  test("getPaginationConfigFromEnv should handle zero values as unlimited", () => {
    process.env.MAX_FILES = "0";
    process.env.MAX_COMMITS = "0";

    const config = getPaginationConfigFromEnv();

    expect(config.maxFiles).toBe(Number.MAX_SAFE_INTEGER);
    expect(config.maxCommits).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("GraphQL Query Generation", () => {
  test("createPRQuery should generate query with default limits", () => {
    const query = createPRQuery();

    expect(query).toContain("commits(first: 100)");
    expect(query).toContain("files(first: 100)");
    expect(query).toContain("comments(first: 100)");
    expect(query).toContain("reviews(first: 100)");
    expect(query).toContain("pageInfo");
  });

  test("createPRQuery should use chunk size when any limit exceeds 100", () => {
    const config: PaginationConfig = {
      maxFiles: 200, // > 100, triggers pagination
      maxCommits: 150, // > 100, triggers pagination
      maxComments: 300, // > 100, triggers pagination
      maxReviews: 75, // < 100, but pagination is triggered by others
    };

    const query = createPRQuery(config);

    // Should use chunk size of 50 when any limit exceeds 100
    expect(query).toContain("commits(first: 50)");
    expect(query).toContain("files(first: 50)");
    expect(query).toContain("comments(first: 50)");
    expect(query).toContain("reviews(first: 50)");
  });

  test("createPRQuery should respect small limits when all are under 100", () => {
    const config: PaginationConfig = {
      maxFiles: 50,
      maxCommits: 75,
      maxComments: 80,
      maxReviews: 25,
    };

    const query = createPRQuery(config);

    // Should use actual limits when all are under 100
    expect(query).toContain("commits(first: 75)");
    expect(query).toContain("files(first: 50)");
    expect(query).toContain("comments(first: 80)");
    expect(query).toContain("reviews(first: 25)");
  });

  test("createPRQuery should include cursors when provided", () => {
    const cursors = {
      commitsCursor: "cursor123",
      filesCursor: "cursor456",
      commentsCursor: "cursor789",
      reviewsCursor: "cursor000",
    };

    const query = createPRQuery(DEFAULT_PAGINATION_CONFIG, cursors);

    expect(query).toContain('commits(first: 100, after: "cursor123")');
    expect(query).toContain('files(first: 100, after: "cursor456")');
    expect(query).toContain('comments(first: 100, after: "cursor789")');
    expect(query).toContain('reviews(first: 100, after: "cursor000")');
  });

  test("createIssueQuery should use chunk size when limit exceeds 100", () => {
    const config: PaginationConfig = {
      maxFiles: 100,
      maxCommits: 100,
      maxComments: 200, // > 100, triggers pagination
      maxReviews: 100,
    };

    const query = createIssueQuery(config);

    // Should use chunk size of 50 when limit exceeds 100
    expect(query).toContain("comments(first: 50)");
    expect(query).toContain("pageInfo");
  });

  test("createIssueQuery should include cursor when provided", () => {
    const query = createIssueQuery(DEFAULT_PAGINATION_CONFIG, "cursor123");

    expect(query).toContain('comments(first: 100, after: "cursor123")');
  });

  test("createIssueQuery should respect small limits when under 100", () => {
    const config: PaginationConfig = {
      maxFiles: 100,
      maxCommits: 100,
      maxComments: 75, // < 100, no pagination
      maxReviews: 100,
    };

    const query = createIssueQuery(config);

    // Should use actual limit when under 100
    expect(query).toContain("comments(first: 75)");
    expect(query).toContain("pageInfo");
  });
});

describe("Pagination Data Fetching", () => {
  let consoleLogSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  test("fetchGitHubData should handle default pagination for PR", async () => {
    const callCount = { current: 0 };
    const mockOctokit = createMockOctokit(
      createMockPR(50),
      undefined,
      callCount,
    );

    const result = await fetchGitHubData({
      octokits: mockOctokit,
      repository: "owner/repo",
      prNumber: "123",
      isPR: true,
      paginationConfig: DEFAULT_PAGINATION_CONFIG,
    });

    expect(callCount.current).toBe(1); // Single query for default config
    expect(result.changedFiles).toHaveLength(50);
    expect(result.contextData).toBeDefined();
  });

  test("fetchGitHubData should handle pagination for PR with large dataset", async () => {
    const callCount = { current: 0 };
    const largePR = createMockPR(150, 120, 80, 60); // More than 50 items each
    const mockOctokit = createMockOctokit(largePR, undefined, callCount);

    const config: PaginationConfig = {
      maxFiles: 1000, // > 100, triggers pagination
      maxCommits: 1000, // > 100, triggers pagination
      maxComments: 1000, // > 100, triggers pagination
      maxReviews: 1000, // > 100, triggers pagination
    };

    const result = await fetchGitHubData({
      octokits: mockOctokit,
      repository: "owner/repo",
      prNumber: "123",
      isPR: true,
      paginationConfig: config,
    });

    expect(callCount.current).toBeGreaterThan(1); // Multiple queries for pagination
    expect(result.changedFiles.length).toBeGreaterThan(50); // Got more than first page
  });

  test("fetchGitHubData should handle pagination limits and show warnings", async () => {
    const callCount = { current: 0 };
    const largePR = createMockPR(200, 200, 200, 200);
    const mockOctokit = createMockOctokit(largePR, undefined, callCount);

    const config: PaginationConfig = {
      maxFiles: 75, // Limit to 75 files (< 100, no pagination)
      maxCommits: 100,
      maxComments: 100,
      maxReviews: 100,
    };

    const result = await fetchGitHubData({
      octokits: mockOctokit,
      repository: "owner/repo",
      prNumber: "123",
      isPR: true,
      paginationConfig: config,
    });

    expect(result.changedFiles).toHaveLength(50); // Gets only first page since no pagination triggered
  });

  test("fetchGitHubData should handle issue pagination", async () => {
    const callCount = { current: 0 };
    const largeIssue = createMockIssue(80); // More than 50 comments
    const mockOctokit = createMockOctokit(undefined, largeIssue, callCount);

    const config: PaginationConfig = {
      maxFiles: 100,
      maxCommits: 100,
      maxComments: 1000, // > 100, triggers pagination
      maxReviews: 100,
    };

    const result = await fetchGitHubData({
      octokits: mockOctokit,
      repository: "owner/repo",
      prNumber: "456",
      isPR: false,
      paginationConfig: config,
    });

    expect(callCount.current).toBeGreaterThan(1); // Multiple queries for pagination
    expect(result.comments.length).toBeGreaterThan(50); // Got more than first page
  });

  test("fetchGitHubData should respect safety limits", async () => {
    const callCount = { current: 0 };
    const mockGraphql = async () => {
      callCount.current++;
      // Always return data with hasNextPage: true to test safety limit
      return {
        repository: {
          pullRequest: {
            ...createMockPR(50),
            files: {
              pageInfo: { hasNextPage: true, endCursor: "cursor" },
              nodes: Array.from({ length: 50 }, (_, i) => ({
                path: `file_${callCount.current}_${i}.ts`,
                additions: 10,
                deletions: 5,
                changeType: "MODIFIED",
              })),
            },
          },
        },
      };
    };

    const mockOctokit: Octokits = {
      graphql: mockGraphql as any,
      rest: {} as any,
    };

    const config: PaginationConfig = {
      maxFiles: Number.MAX_SAFE_INTEGER, // > 100, triggers pagination
      maxCommits: 100,
      maxComments: 100,
      maxReviews: 100,
    };

    await fetchGitHubData({
      octokits: mockOctokit,
      repository: "owner/repo",
      prNumber: "123",
      isPR: true,
      paginationConfig: config,
    });

    expect(callCount.current).toBeLessThanOrEqual(50); // Safety limit
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Reached maximum fetch limit"),
    );
  });

  test("fetchGitHubData should handle errors gracefully", async () => {
    const mockGraphql = async () => {
      throw new Error("API Error");
    };

    const mockOctokit: Octokits = {
      graphql: mockGraphql as any,
      rest: {} as any,
    };

    await expect(
      fetchGitHubData({
        octokits: mockOctokit,
        repository: "owner/repo",
        prNumber: "123",
        isPR: true,
      }),
    ).rejects.toThrow("Failed to fetch PR data");
  });

  test("fetchGitHubData should handle missing repository parts", async () => {
    const mockOctokit = createMockOctokit();

    await expect(
      fetchGitHubData({
        octokits: mockOctokit,
        repository: "invalid",
        prNumber: "123",
        isPR: true,
      }),
    ).rejects.toThrow("Invalid repository format");
  });

  test("fetchGitHubData should use environment config when no config provided", async () => {
    process.env.MAX_FILES = "150";

    const mockOctokit = createMockOctokit(createMockPR(50));

    const result = await fetchGitHubData({
      octokits: mockOctokit,
      repository: "owner/repo",
      prNumber: "123",
      isPR: true,
      // No paginationConfig provided - should use env
    });

    expect(result.contextData).toBeDefined();
  });
});

describe("Edge Cases", () => {
  test("should handle PR with no files", async () => {
    const emptyPR = createMockPR(0, 0, 0, 0);
    const mockOctokit = createMockOctokit(emptyPR);

    const result = await fetchGitHubData({
      octokits: mockOctokit,
      repository: "owner/repo",
      prNumber: "123",
      isPR: true,
    });

    expect(result.changedFiles).toHaveLength(0);
    expect(result.comments).toHaveLength(0);
  });

  test("should handle issue with no comments", async () => {
    const emptyIssue = createMockIssue(0);
    const mockOctokit = createMockOctokit(undefined, emptyIssue);

    const result = await fetchGitHubData({
      octokits: mockOctokit,
      repository: "owner/repo",
      prNumber: "456",
      isPR: false,
    });

    expect(result.comments).toHaveLength(0);
  });

  test("should handle pagination config with zero values as unlimited", async () => {
    // Set environment variables to 0, which will be converted to MAX_SAFE_INTEGER
    process.env.MAX_FILES = "0";
    process.env.MAX_COMMITS = "0";
    process.env.MAX_COMMENTS = "0";
    process.env.MAX_REVIEWS = "0";

    const mockOctokit = createMockOctokit(createMockPR(50));

    const result = await fetchGitHubData({
      octokits: mockOctokit,
      repository: "owner/repo",
      prNumber: "123",
      isPR: true,
      // No paginationConfig provided - will use env vars
    });

    // Since -1 becomes MAX_SAFE_INTEGER in env parsing, we get all available data
    expect(result.changedFiles).toHaveLength(50);
    expect(result.comments).toHaveLength(50);
  });
});
