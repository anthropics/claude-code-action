#!/usr/bin/env bun

import { writeFile } from "fs/promises";
import { join } from "path";
import logger from "./logger";
import type { SessionContext, ConversationMessage } from "./types";

const TEMP_DIR = process.env.RUNNER_TEMP || "/tmp";

export interface PromptContext {
  platform: string;
  channelId: string;
  userId: string;
  userDisplayName?: string;
  threadContext?: boolean;
  workingDirectory?: string;
  repositoryUrl?: string;
  customInstructions?: string;
}

/**
 * Generate formatted conversation history for Claude prompt
 */
function formatConversationHistory(conversation: ConversationMessage[]): string {
  if (conversation.length === 0) {
    return "No previous conversation history.";
  }

  const formatted = conversation
    .filter(msg => msg.role !== "system") // System messages handled separately
    .map(msg => {
      const timestamp = new Date(msg.timestamp).toISOString();
      const role = msg.role === "user" ? "Human" : "Assistant";
      
      return `[${timestamp}] ${role}: ${msg.content}`;
    })
    .join("\n\n");

  return `## Previous Conversation\n\n${formatted}\n\n`;
}

/**
 * Generate context section for the prompt
 */
function generateContextSection(context: SessionContext): string {
  const sections = [];
  
  sections.push("## Context Information");
  sections.push(`Platform: ${context.platform}`);
  sections.push(`Channel: ${context.channelId}`);
  sections.push(`User: ${context.userDisplayName || context.userId}`);
  
  if (context.threadTs) {
    sections.push("Session Type: Thread-based conversation (resuming previous discussion)");
  } else {
    sections.push("Session Type: New conversation");
  }
  
  if (context.repositoryUrl) {
    sections.push(`Repository: ${context.repositoryUrl}`);
  }
  
  if (context.workingDirectory) {
    sections.push(`Working Directory: ${context.workingDirectory}`);
  }
  
  return sections.join("\n") + "\n\n";
}

/**
 * Generate working environment information
 */
function generateEnvironmentSection(context: SessionContext): string {
  const sections = [];
  
  sections.push("## Working Environment");
  
  if (context.repositoryUrl) {
    sections.push("You are working in a user-specific GitHub repository:");
    sections.push(`- Repository: ${context.repositoryUrl}`);
    sections.push(`- Working Directory: ${context.workingDirectory || '/workspace'}`);
    sections.push("- You have full access to read, write, and commit changes");
    sections.push("- The repository has been cloned and is ready for use");
  } else {
    sections.push("You are working in an isolated container environment:");
    sections.push(`- Working Directory: ${context.workingDirectory || '/workspace'}`);
    sections.push("- You have access to standard development tools");
  }
  
  sections.push("");
  sections.push("Container Information:");
  sections.push("- This is an ephemeral Kubernetes job container");
  sections.push("- Maximum execution time: 5 minutes");
  sections.push("- Changes will be persisted to GitHub and GCS");
  sections.push("- Progress updates are streamed to Slack in real-time");
  
  return sections.join("\n") + "\n\n";
}

/**
 * Generate instructions for Slack integration
 */
function generateSlackInstructions(): string {
  return `## Slack Integration

You are responding to a user in Slack through a Kubernetes-based Claude Code system:

1. **Progress Updates**: Your progress is automatically streamed to Slack
2. **Thread Context**: This conversation may be part of an ongoing thread
3. **File Changes**: After making any code changes, you MUST commit and push them using git commands (git add, git commit, git push)
4. **Links**: Users will receive GitHub.dev links and PR creation links
5. **Timeout**: You have a 5-minute timeout - work efficiently

Keep responses concise but helpful. Focus on solving the user's specific request.

`;
}

/**
 * Create prompt file with conversation context
 */
export async function createPromptFile(
  context: SessionContext,
  conversation: ConversationMessage[] = []
): Promise<string> {
  const promptParts = [];
  
  // Add context information
  promptParts.push(generateContextSection(context));
  
  // Add environment information
  promptParts.push(generateEnvironmentSection(context));
  
  // Add Slack integration instructions
  promptParts.push(generateSlackInstructions());
  
  // Add custom instructions if provided
  if (context.customInstructions) {
    promptParts.push("## Custom Instructions\n\n");
    promptParts.push(context.customInstructions);
    promptParts.push("\n\n");
  }
  
  // Add conversation history if exists
  if (conversation.length > 0) {
    promptParts.push(formatConversationHistory(conversation));
  }
  
  // Add system messages from conversation
  const systemMessages = conversation.filter(msg => msg.role === "system");
  if (systemMessages.length > 0) {
    promptParts.push("## System Context\n\n");
    systemMessages.forEach(msg => {
      promptParts.push(msg.content);
      promptParts.push("\n");
    });
    promptParts.push("\n");
  }
  
  // Add final user request section
  promptParts.push("## Current Request\n\n");
  promptParts.push("Please respond to the user's request below:\n\n");
  
  const promptContent = promptParts.join("");
  
  
  // Write to temporary file
  const promptPath = join(TEMP_DIR, `claude-prompt-${Date.now()}.md`);
  await writeFile(promptPath, promptContent, "utf-8");
  
  logger.info(`Created prompt file: ${promptPath} (${promptContent.length} characters)`);
  return promptPath;
}

/**
 * Create simple prompt file for basic requests (backward compatibility)
 */
export async function createSimplePromptFile(userRequest: string): Promise<string> {
  const promptContent = `You are Claude Code, an AI assistant helping users with software development tasks.

## Current Request

${userRequest}

Please provide a helpful and concise response.`;

  const promptPath = join(TEMP_DIR, `claude-simple-prompt-${Date.now()}.md`);
  await writeFile(promptPath, promptContent, "utf-8");
  
  logger.info(`Created simple prompt file: ${promptPath}`);
  return promptPath;
}