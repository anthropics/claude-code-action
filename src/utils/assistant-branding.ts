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
 * Get the assistant product name (usually "<AssistantName> Code")
 */
export function getAssistantProductName(): string {
  return `${getAssistantName()} Code`;
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
  const assistantProductName = getAssistantProductName().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${assistantProductName} is working[…\\.]{1,3}(?:\\s*<img[^>]*>)?`, 'i');
}

/**
 * Get PR title template for changes from assistant
 */
export function getPRTitleTemplate(entityType: string, entityNumber: number): string {
  return `${entityType} #${entityNumber}: Changes from ${getAssistantName()}`;
}

/**
 * Get PR body template for generated PRs
 */
export function getPRBodyTemplate(entityType: string, entityNumber: number): string {
  return `This PR addresses ${entityType.toLowerCase()} #${entityNumber}\n\n${getSignatureTemplate()}`;
}