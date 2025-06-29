// Types for GitHub GraphQL query responses
export type GitHubAuthor = {
  login: string;
  name?: string;
};

export type PageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};

export type GitHubComment = {
  id: string;
  databaseId: string;
  body: string;
  author: GitHubAuthor;
  createdAt: string;
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
  comments: {
    pageInfo: PageInfo;
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
  additions: number;
  deletions: number;
  state: string;
  commits: {
    totalCount: number;
    pageInfo: PageInfo;
    nodes: Array<{
      commit: GitHubCommit;
    }>;
  };
  files: {
    pageInfo: PageInfo;
    nodes: GitHubFile[];
  };
  comments: {
    pageInfo: PageInfo;
    nodes: GitHubComment[];
  };
  reviews: {
    pageInfo: PageInfo;
    nodes: GitHubReview[];
  };
};

export type GitHubIssue = {
  title: string;
  body: string;
  author: GitHubAuthor;
  createdAt: string;
  state: string;
  comments: {
    pageInfo: PageInfo;
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
