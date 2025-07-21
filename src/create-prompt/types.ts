/** @see {@link https://docs.anthropic.com/en/docs/claude-code/settings#tools-available-to-claude} */
type ClaudeTool =
  | "BASH"
  | "EDIT"
  | "GLOB"
  | "GREP"
  | "LS"
  | "MULTIEDIT"
  | "NOTEBOOKEDIT"
  | "NOTEBOOKREAD"
  | "READ"
  | "TASK"
  | "TODOWRITE"
  | "WEBFETCH"
  | "WEBSEARCH"
  | "WRITE";

/** @see {@link https://docs.anthropic.com/en/docs/claude-code/iam#tool-specific-permission-rules} */
type ClaudeToolPermission = `${ClaudeTool}${"" | `(${string})`}`;

export type CommonFields = {
  repository: string;
  claudeCommentId: string;
  triggerPhrase: string;
  triggerUsername?: string;
  customInstructions?: string;
  allowedTools?: ClaudeToolPermission[];
  disallowedTools?: ClaudeToolPermission[];
  directPrompt?: string;
};

type PullRequestReviewCommentEvent = {
  eventName: "pull_request_review_comment";
  isPR: true;
  prNumber: string;
  commentId?: string; // May be present for review comments
  commentBody: string;
  claudeBranch?: string;
  baseBranch?: string;
};

type PullRequestReviewEvent = {
  eventName: "pull_request_review";
  isPR: true;
  prNumber: string;
  commentBody: string;
  claudeBranch?: string;
  baseBranch?: string;
};

type IssueCommentEvent = {
  eventName: "issue_comment";
  commentId: string;
  issueNumber: string;
  isPR: false;
  baseBranch: string;
  claudeBranch: string;
  commentBody: string;
};

// Not actually a real github event, since issue comments and PR coments are both sent as issue_comment
type PullRequestCommentEvent = {
  eventName: "issue_comment";
  commentId: string;
  prNumber: string;
  isPR: true;
  commentBody: string;
  claudeBranch?: string;
  baseBranch?: string;
};

type IssueOpenedEvent = {
  eventName: "issues";
  eventAction: "opened";
  isPR: false;
  issueNumber: string;
  baseBranch: string;
  claudeBranch: string;
};

type IssueAssignedEvent = {
  eventName: "issues";
  eventAction: "assigned";
  isPR: false;
  issueNumber: string;
  baseBranch: string;
  claudeBranch: string;
  assigneeTrigger?: string;
};

type IssueLabeledEvent = {
  eventName: "issues";
  eventAction: "labeled";
  isPR: false;
  issueNumber: string;
  baseBranch: string;
  claudeBranch: string;
  labelTrigger: string;
};

type PullRequestEvent = {
  eventName: "pull_request";
  eventAction?: string; // opened, synchronize, etc.
  isPR: true;
  prNumber: string;
  claudeBranch?: string;
  baseBranch?: string;
};

// Union type for all possible event types
export type EventData =
  | PullRequestReviewCommentEvent
  | PullRequestReviewEvent
  | PullRequestCommentEvent
  | IssueCommentEvent
  | IssueOpenedEvent
  | IssueAssignedEvent
  | IssueLabeledEvent
  | PullRequestEvent;

// Combined type with separate eventData field
export type PreparedContext = CommonFields & {
  eventData: EventData;
};
