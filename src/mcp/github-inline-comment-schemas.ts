import { z } from "zod";

/**
 * Raw shape passed to `server.tool` for create_inline_comment.
 *
 * `line` and `startLine` are constrained to positive integers: diff line
 * numbers are 1-based, so 0 and fractions are never valid, and a 0 reaching
 * the handler would be indistinguishable from an omitted argument.
 *
 * Rules that involve both fields live in `createInlineCommentPayloadSchema`
 * below, which is what the handler parses through.
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
      "Line number for the comment. Always required: the line for a single-line comment, or the END line of the range when startLine is given.",
    ),
  startLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Start line for multi-line comments. Must be provided together with line (the end line), and must not be greater than it.",
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

/**
 * Full payload schema, including the rules that span more than one field.
 *
 * `server.tool` is registered with the raw shape above, which is converted to
 * JSON Schema key by key and so cannot express the relationship between `line`
 * and `startLine`. The handler parses through this schema instead, so those
 * rules are enforced in one place rather than re-implemented as ad-hoc checks.
 *
 * `line` is required either way: it is the line for a single-line comment and
 * the end line of the range for a multi-line one. A `startLine` without it
 * would be sent to GitHub as `start_line` with `line: undefined`.
 */
export const createInlineCommentPayloadSchema = z
  .object(createInlineCommentInputSchema)
  .superRefine((data, ctx) => {
    if (data.line === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["line"],
        message:
          data.startLine === undefined
            ? "Either 'line' for single-line comments or both 'startLine' and 'line' for multi-line comments must be provided"
            : "'line' is required when 'startLine' is provided: it is the end line of the multi-line range",
      });
      return;
    }

    if (data.startLine !== undefined && data.startLine > data.line) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startLine"],
        message: `'startLine' (${data.startLine}) must not be greater than 'line' (${data.line}), which is the end of the range`,
      });
    }
  })
  // Every branch above requires `line`, so it is present by the time the
  // transform runs. Restating that here keeps the handler from having to
  // re-check it before passing the value to the GitHub API.
  .transform((data) => ({ ...data, line: data.line as number }));
