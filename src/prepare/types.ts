import type { GitHubContext } from "../github/context";
import type { Octokits } from "../github/api/client";
import type { Mode } from "../modes/types";

export type PrepareResult = {
  commentId?: number;
  branchInfo: {
    baseBranch: string;
    claudeBranch?: string;
    currentBranch: string;
  };
  mcpConfig: string;
  /** Generated prompt content for Claude */
  promptContent?: string;
  /** Comma-separated list of allowed tools */
  allowedTools?: string;
  /** Comma-separated list of disallowed tools */
  disallowedTools?: string;
};

export type PrepareOptions = {
  context: GitHubContext;
  octokit: Octokits;
  mode: Mode;
  githubToken: string;
};
