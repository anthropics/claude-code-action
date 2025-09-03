/**
 * Centralized utilities for customizable assistant branding
 */

/**
 * Get the assistant name from environment variable, defaulting to "Claude"
 */
export function getAssistantName(): string {
  return process.env.ASSISTANT_NAME || "Claude";
}

/**
 * Get the assistant product name from environment variable, defaulting to "Claude Code"
 */
export function getAssistantProductName(): string {
  return process.env.ASSISTANT_PRODUCT_NAME || "Claude Code";
}

/**
 * Get the working status message template
 */
export function getWorkingMessage(): string {
  return `${getAssistantProductName()} is working…`;
}

/**
 * Get the signature template for PR descriptions and similar
 */
export function getSignatureTemplate(): string {
  return `Generated with [${getAssistantProductName()}](https://claude.ai/code)`;
}

/**
 * Get the report header for execution summaries
 */
export function getReportHeader(): string {
  return `## ${getAssistantProductName()} Report`;
}

/**
 * Get the pattern for matching working messages in comments (for cleaning up)
 */
export function getWorkingMessagePattern(): RegExp {
  const assistantProductName = getAssistantProductName().replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  return new RegExp(
    `${assistantProductName} is working[…\\.]{1,3}(?:\\s*<img[^>]*>)?`,
    "i",
  );
}

/**
 * Get PR title template for changes from assistant
 */
export function getPRTitleTemplate(
  entityType: string,
  entityNumber: number,
): string {
  return `${entityType} #${entityNumber}: Changes from ${getAssistantName()}`;
}

/**
 * Get PR body template for generated PRs
 */
export function getPRBodyTemplate(
  entityType: string,
  entityNumber: number,
): string {
  return `This PR addresses ${entityType.toLowerCase()} #${entityNumber}\n\n${getSignatureTemplate()}`;
}

/**
 * Get error header for comment updates when action fails
 */
export function getErrorHeader(durationStr?: string): string {
  let header = `**${getAssistantName()} encountered an error`;
  if (durationStr) {
    header += ` after ${durationStr}`;
  }
  header += "**";
  return header;
}

/**
 * Get success header for comment updates when action succeeds
 */
export function getSuccessHeader(
  username: string,
  durationStr?: string,
): string {
  let header = `**${getAssistantName()} finished @${username}'s task`;
  if (durationStr) {
    header += ` in ${durationStr}`;
  }
  header += "**";
  return header;
}

/**
 * Get system prompt prefix for AI assistant identity
 */
export function getSystemPromptPrefix(): string {
  return `You are ${getAssistantName()}, an AI assistant`;
}

/**
 * Get permission error message for git operations
 */
export function getCommitPermissionError(
  branch: string,
  errorText: string,
): string {
  return (
    `Permission denied: Unable to push commits to branch '${branch}'. ` +
    `Please rebase your branch from the main/master branch to allow ${getAssistantName()} to commit.\n\n` +
    `Original error: ${errorText}`
  );
}

/**
 * Get auto-commit message template
 */
export function getAutoCommitMessage(runId: string): string {
  return `Auto-commit: Save uncommitted changes from ${getAssistantName()}\n\nRun ID: ${runId}`;
}

/**
 * Get reference to assistant in user instructions
 */
export function getAssistantReference(): string {
  return getAssistantName();
}
