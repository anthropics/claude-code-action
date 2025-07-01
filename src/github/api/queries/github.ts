// GraphQL queries for GitHub data

export interface PaginationConfig {
  maxFiles: number;
  maxCommits: number;
  maxComments: number;
  maxReviews: number;
}

export const DEFAULT_PAGINATION_CONFIG: PaginationConfig = {
  maxFiles: 100,
  maxCommits: 100,
  maxComments: 100,
  maxReviews: 100,
};

export function createPRQuery(
  config: PaginationConfig = DEFAULT_PAGINATION_CONFIG,
  cursors?: {
    commitsCursor?: string;
    filesCursor?: string;
    commentsCursor?: string;
    reviewsCursor?: string;
  },
) {
  // Use smaller chunks for pagination to respect rate limits
  const chunkSize = 50;

  // Use pagination (chunk size) if any limit exceeds 100, otherwise use the limit directly
  const needsPagination =
    config.maxFiles > 100 ||
    config.maxCommits > 100 ||
    config.maxComments > 100 ||
    config.maxReviews > 100;

  const commitsFirst = needsPagination
    ? chunkSize
    : Math.min(config.maxCommits, 100);
  const filesFirst = needsPagination
    ? chunkSize
    : Math.min(config.maxFiles, 100);
  const commentsFirst = needsPagination
    ? chunkSize
    : Math.min(config.maxComments, 100);
  const reviewsFirst = needsPagination
    ? chunkSize
    : Math.min(config.maxReviews, 100);

  const commitsAfter = cursors?.commitsCursor
    ? `, after: "${cursors.commitsCursor}"`
    : "";
  const filesAfter = cursors?.filesCursor
    ? `, after: "${cursors.filesCursor}"`
    : "";
  const commentsAfter = cursors?.commentsCursor
    ? `, after: "${cursors.commentsCursor}"`
    : "";
  const reviewsAfter = cursors?.reviewsCursor
    ? `, after: "${cursors.reviewsCursor}"`
    : "";

  return `
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          title
          body
          author {
            login
          }
          baseRefName
          headRefName
          headRefOid
          createdAt
          additions
          deletions
          state
          commits(first: ${commitsFirst}${commitsAfter}) {
            totalCount
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              commit {
                oid
                message
                author {
                  name
                  email
                }
              }
            }
          }
          files(first: ${filesFirst}${filesAfter}) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              path
              additions
              deletions
              changeType
            }
          }
          comments(first: ${commentsFirst}${commentsAfter}) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              databaseId
              body
              author {
                login
              }
              createdAt
            }
          }
          reviews(first: ${reviewsFirst}${reviewsAfter}) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              databaseId
              author {
                login
              }
              body
              state
              submittedAt
              comments(first: ${needsPagination ? chunkSize : Math.min(config.maxComments, 100)}) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  id
                  databaseId
                  body
                  path
                  line
                  author {
                    login
                  }
                  createdAt
                }
              }
            }
          }
        }
      }
    }
  `;
}

// Legacy query for backward compatibility (used by legacy code)
export const PR_QUERY = createPRQuery();

export function createIssueQuery(
  config: PaginationConfig = DEFAULT_PAGINATION_CONFIG,
  commentsCursor?: string,
) {
  const needsPagination = config.maxComments > 100;
  const commentsFirst = needsPagination
    ? 50
    : Math.min(config.maxComments, 100);
  const commentsAfter = commentsCursor ? `, after: "${commentsCursor}"` : "";

  return `
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) {
          title
          body
          author {
            login
          }
          createdAt
          state
          comments(first: ${commentsFirst}${commentsAfter}) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              databaseId
              body
              author {
                login
              }
              createdAt
            }
          }
        }
      }
    }
  `;
}

// Legacy query for backward compatibility (used by legacy code)
export const ISSUE_QUERY = createIssueQuery();

export const USER_QUERY = `
  query($login: String!) {
    user(login: $login) {
      name
    }
  }
`;
