import { z } from "zod";

/**
 * Raw shape passed to `server.tool` for create_inline_comment.
 *
 * `line` and `startLine` are constrained to positive integers. Diff line
 * numbers are 1-based, so 0 is never valid, and the handler tests them for
 * falsiness (`!line`, `!startLine`) rather than for presence - so a 0 that got
 * past the schema would be read as "absent" and silently change the request
 * rather than be rejected.
 */
export const createInlineCommentInputSchema = {
  path: z
    .string()
    .describe("The file path to comment on (e.g., 'src/index.js')"),
  body: z
    .string()
    .describe(
      "The comment text (supports markdown and GitHub code suggestion blocks). " +
        "For code suggestions, use: ```suggestion\\nreplacement code\\n```. " +
        "IMPORTANT: The suggestion block will REPLACE the ENTIRE line range (single line or startLine to line). " +
        "Ensure the replacement is syntactically complete and valid - it must work as a drop-in replacement for the selected lines.",
    ),
  line: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Line number for single-line comments (required if startLine is not provided)",
    ),
  startLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Start line for multi-line comments (use with line parameter for the end line)",
    ),
  side: z
    .enum(["LEFT", "RIGHT"])
    .optional()
    .default("RIGHT")
    .describe(
      "Side of the diff to comment on: LEFT (old code) or RIGHT (new code)",
    ),
  commit_id: z
    .string()
    .optional()
    .describe("Specific commit SHA to comment on (defaults to latest commit)"),
  confirmed: z
    .boolean()
    .optional()
    .describe(
      "Set true to post immediately. When omitted, the call is buffered " +
        "and classified after the session completes — real review comments " +
        "post, test/probe comments are dropped. Set false to buffer and " +
        "never post. Only set true when posting final review comments.",
    ),
};

export const createInlineCommentPayloadSchema = z.object(
  createInlineCommentInputSchema,
);
