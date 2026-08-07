// GraphQL queries for GitHub data
//
// Author selections include `__typename` so bot actors can be detected.
// GraphQL `login` for bots omits the REST/UI `[bot]` suffix (e.g. "github-actions"
// with __typename "Bot"); actor filters rely on that typename for `*[bot]`.

export const PR_QUERY = `
  query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        title
        body
        author {
          __typename
          login
        }
        baseRefName
        headRefName
        headRefOid
        isCrossRepository
        headRepository {
          owner {
            login
          }
          name
        }
        createdAt
        updatedAt
        lastEditedAt
        additions
        deletions
        state
        labels(first: 100) {
          nodes {
            name
          }
        }
        commits(first: 100) {
          totalCount
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
        files(first: 100) {
          nodes {
            path
            additions
            deletions
            changeType
          }
        }
        comments(first: 100) {
          nodes {
            id
            databaseId
            body
            author {
              __typename
              login
            }
            createdAt
            updatedAt
            lastEditedAt
            isMinimized
          }
        }
        reviews(first: 100) {
          nodes {
            id
            databaseId
            author {
              __typename
              login
            }
            body
            state
            submittedAt
            updatedAt
            lastEditedAt
            comments(first: 100) {
              nodes {
                id
                databaseId
                body
                path
                line
                author {
                  __typename
                  login
                }
                createdAt
                updatedAt
                lastEditedAt
                isMinimized
              }
            }
          }
        }
      }
    }
  }
`;

export const ISSUE_QUERY = `
  query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $number) {
        title
        body
        author {
          __typename
          login
        }
        createdAt
        updatedAt
        lastEditedAt
        state
        labels(first: 100) {
          nodes {
            name
          }
        }
        comments(first: 100) {
          nodes {
            id
            databaseId
            body
            author {
              __typename
              login
            }
            createdAt
            updatedAt
            lastEditedAt
            isMinimized
          }
        }
      }
    }
  }
`;

export const USER_QUERY = `
  query($login: String!) {
    user(login: $login) {
      name
    }
  }
`;
