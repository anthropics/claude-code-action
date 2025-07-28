import type { ParsedGitHubContext } from "../github/context";

export type ModeName = "tag" | "agent";

export type ModeContext = {
  mode: ModeName;
  githubContext: ParsedGitHubContext;
  commentId?: number;
  baseBranch?: string;
  claudeBranch?: string;
};

export type ModeData = {
  commentId?: number;
  baseBranch?: string;
  claudeBranch?: string;
};

/**
 * Mode interface for claude-code-action execution modes.
 * Each mode defines its own behavior for trigger detection, prompt generation,
 * and tracking comment creation.
 *
 * Current modes include:
 * - 'tag': Traditional implementation triggered by mentions/assignments
 * - 'agent': For automation with no trigger checking
 */
export type Mode = {
  name: ModeName;
  description: string;

  /**
   * Determines if this mode should trigger based on the GitHub context
   */
  shouldTrigger(context: ParsedGitHubContext): boolean;

  /**
   * Prepares the mode context with any additional data needed for prompt generation
   */
  prepareContext(context: ParsedGitHubContext, data?: ModeData): ModeContext;

  /**
   * Returns the list of tools that should be allowed for this mode
   */
  getAllowedTools(): string[];

  /**
   * Returns the list of tools that should be disallowed for this mode
   */
  getDisallowedTools(): string[];

  /**
   * Determines if this mode should create a tracking comment
   */
  shouldCreateTrackingComment(): boolean;
};
