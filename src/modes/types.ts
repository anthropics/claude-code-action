import type { GitHubContext } from "../github/context";
import type { PreparedContext } from "../create-prompt/types";
import type { FetchDataResult } from "../github/data/fetcher";
import type { Octokits } from "../github/api/client";

export type ModeName = "tag" | "agent";

export type ModeContext = {
  mode: ModeName;
  githubContext: GitHubContext;
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
 * - 'tag': Interactive mode triggered by @claude mentions
 * - 'agent': Direct automation mode triggered by explicit prompts
 */
export type Mode = {
  name: ModeName;
  description: string;

  /**
   * Determines if this mode should trigger based on the GitHub context
   */
  shouldTrigger(context: GitHubContext): boolean;

  /**
   * Prepares the mode context with any additional data needed for prompt generation
   */
  prepareContext(context: GitHubContext, data?: ModeData): ModeContext;

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

  /**
   * Generates the prompt for this mode.
   * @returns The complete prompt string
   */
  generatePrompt(
    context: PreparedContext,
    githubData: FetchDataResult,
    useCommitSigning: boolean,
  ): string;

  /**
   * Prepares the GitHub environment for this mode.
   * Each mode decides how to handle different event types.
   * @returns PrepareResult with commentId, branchInfo, and mcpConfig
   */
  prepare(options: ModeOptions): Promise<ModeResult>;

  /**
   * Returns an optional system prompt to append to Claude's base system prompt.
   * This allows modes to add mode-specific instructions.
   * @returns The system prompt string or undefined if no additional prompt is needed
   */
  getSystemPrompt?(context: ModeContext): string | undefined;
};

// Define types for mode prepare method
export type ModeOptions = {
  context: GitHubContext;
  octokit: Octokits;
  githubToken: string;
};

export type ModeResult = {
  commentId?: number;
  branchInfo: {
    baseBranch: string;
    claudeBranch?: string;
    currentBranch: string;
  };
  mcpConfig: string;
};
