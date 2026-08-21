import { z } from "zod";

/**
 * Schema for Claude Code settings.json file
 * Based on the structure documented in the README and used in tests
 */
export const ClaudeSettingsSchema = z
  .object({
    model: z
      .string()
      .min(1, "Model name cannot be empty")
      .optional()
      .describe("Override the default model"),

    env: z
      .record(z.string())
      .optional()
      .describe("Environment variables for the session"),

    permissions: z
      .object({
        allow: z
          .array(z.string().min(1, "Tool name cannot be empty"))
          .optional()
          .describe("List of allowed tools"),
        deny: z
          .array(z.string().min(1, "Tool name cannot be empty"))
          .optional()
          .describe("List of denied tools"),
      })
      .optional()
      .describe("Tool usage permissions"),

    hooks: z
      .object({
        PreToolUse: z
          .array(
            z.object({
              matcher: z
                .string()
                .min(1, "Matcher pattern cannot be empty")
                .describe("Pattern to match tool names"),
              hooks: z
                .array(
                  z.object({
                    type: z
                      .string()
                      .min(1, "Hook type cannot be empty")
                      .describe("Type of hook (e.g., 'command', 'log')"),
                    command: z
                      .string()
                      .min(1, "Command cannot be empty")
                      .optional()
                      .describe("Command to execute"),
                  }),
                )
                .min(1, "At least one hook must be defined")
                .describe("List of hooks to execute"),
            }),
          )
          .optional()
          .describe("Pre-tool-use hooks"),
      })
      .optional()
      .describe("Hook configurations"),

    enableAllProjectMcpServers: z
      .boolean()
      .optional()
      .describe("Enable all project MCP servers (automatically set to true)"),

    includeCoAuthoredBy: z
      .boolean()
      .optional()
      .describe("Include co-authored-by in git commits"),
  })
  .passthrough() // Allow additional properties for future extensibility
  .describe("Claude Code settings configuration");

export type ClaudeSettings = z.infer<typeof ClaudeSettingsSchema>;

/**
 * Validates Claude Code settings and returns typed result
 * @param data - Raw settings data to validate
 * @returns Validated settings or throws detailed error
 */
export function validateSettings(data: unknown): ClaudeSettings {
  return ClaudeSettingsSchema.parse(data);
}

/**
 * Safely validates Claude Code settings and returns result with error info
 * @param data - Raw settings data to validate
 * @returns Validation result with success/error information
 */
export function safeValidateSettings(data: unknown) {
  return ClaudeSettingsSchema.safeParse(data);
}
