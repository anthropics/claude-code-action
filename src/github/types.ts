// Types for GitHub GraphQL query responses
export type GitHubAuthor = {
  login: string;
  name?: string;
};

export type GitHubComment = {
  id: string;
  databaseId: string;
  body: string;
  author: GitHubAuthor;
  createdAt: string;
  updatedAt?: string;
  lastEditedAt?: string;
  isMinimized?: boolean;
};

export type GitHubReviewComment = GitHubComment & {
  path: string;
  line: number | null;
};

export type GitHubCommit = {
  oid: string;
  message: string;
  author: {
    name: string;
    email: string;
  };
};

export type GitHubFile = {
  path: string;
  additions: number;
  deletions: number;
  changeType: string;
};

export type GitHubReview = {
  id: string;
  databaseId: string;
  author: GitHubAuthor;
  body: string;
  state: string;
  submittedAt: string;
  updatedAt?: string;
  lastEditedAt?: string;
  comments: {
    nodes: GitHubReviewComment[];
  };
};

export type GitHubPullRequest = {
  title: string;
  body: string;
  author: GitHubAuthor;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  createdAt: string;
  updatedAt?: string;
  lastEditedAt?: string;
  additions: number;
  deletions: number;
  state: string;
  labels: {
    nodes: Array<{
      name: string;
    }>;
  };
  commits: {
    totalCount: number;
    nodes: Array<{
      commit: GitHubCommit;
    }>;
  };
  files: {
    nodes: GitHubFile[];
  };
  comments: {
    nodes: GitHubComment[];
  };
  reviews: {
    nodes: GitHubReview[];
  };
};

export type GitHubIssue = {
  title: string;
  body: string;
  author: GitHubAuthor;
  createdAt: string;
  updatedAt?: string;
  lastEditedAt?: string;
  state: string;
  labels: {
    nodes: Array<{
      name: string;
    }>;
  };
  comments: {
    nodes: GitHubComment[];
  };
};

export type PullRequestQueryResponse = {
  repository: {
    pullRequest: GitHubPullRequest;
  };
};

export type IssueQueryResponse = {
  repository: {
    issue: GitHubIssue;
  };
};
