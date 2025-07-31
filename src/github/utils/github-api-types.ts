/**
 * GitHub API response types for attachment processing
 */

export interface GitHubCommentResponse {
  data: {
    body_html?: string;
    [key: string]: any;
  };
}

export interface GitHubReviewResponse {
  data: {
    body_html?: string;
    [key: string]: any;
  };
}

export interface GitHubIssueResponse {
  data: {
    body_html?: string;
    [key: string]: any;
  };
}

export interface GitHubPullRequestResponse {
  data: {
    body_html?: string;
    [key: string]: any;
  };
}

/**
 * Type guard to check if response has body_html
 */
export function hasBodyHtml(
  response: any,
): response is { data: { body_html: string } } {
  return (
    response && response.data && typeof response.data.body_html === "string"
  );
}
