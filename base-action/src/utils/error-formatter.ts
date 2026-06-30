import { ZodError } from "zod";

/**
 * Formats JSON syntax errors with helpful hints
 * @param error - The SyntaxError from JSON.parse()
 * @param content - The original JSON content
 * @param source - Source description (e.g., "settings.json", "inline JSON")
 * @returns Formatted error with hints
 */
export function formatJsonSyntaxError(
  error: SyntaxError,
  content: string,
  source: string = "JSON",
): Error {
  let errorMessage = `JSON syntax error in ${source}: ${error.message}`;

  // Add helpful hints for common JSON errors based on error message and content
  const hints = getJsonSyntaxHints(error.message, content);
  if (hints.length > 0) {
    errorMessage += `\n\n${hints.join("\n")}`;
  }

  return new Error(errorMessage);
}

/**
 * Formats Zod validation errors with helpful path information
 * @param error - The ZodError from validation
 * @param source - Source description (e.g., "settings.json")
 * @returns Formatted error message
 */
export function formatZodValidationError(
  error: ZodError,
  source: string = "settings",
): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";

    let message = `  • ${path}: ${issue.message}`;

    // Add context for specific error types
    if (issue.code === "invalid_type") {
      message += ` (expected ${issue.expected}, got ${issue.received})`;
    }

    return message;
  });

  let errorMessage = `Invalid ${source} configuration:\n\n${issues.join("\n")}`;

  // Add helpful examples for common validation errors
  const examples = getValidationExamples(error);
  if (examples.length > 0) {
    errorMessage += `\n\nExamples of correct format:\n${examples.join("\n")}`;
  }

  errorMessage += `\n\nPlease check the documentation for valid settings options.`;

  return errorMessage;
}

/**
 * Provides helpful hints for common JSON syntax errors
 * @param errorMessage - The original error message
 * @param content - The JSON content that failed to parse
 * @returns Array of helpful hints
 */
function getJsonSyntaxHints(errorMessage: string, content: string): string[] {
  const hints: string[] = [];

  // Check for trailing commas in the content
  if (content.includes(",]") || content.includes(",}")) {
    hints.push(
      "Hint: Remove the trailing comma before the closing bracket or brace.",
    );
  } else if (errorMessage.includes("comma")) {
    hints.push(
      "Hint: Remove the trailing comma before the closing bracket or brace.",
    );
  }

  // Check for missing quotes on property names
  if (
    errorMessage.includes("Property name must be a string") &&
    !content.includes(",]") &&
    !content.includes(",}")
  ) {
    hints.push("Hint: Property names must be enclosed in double quotes.");
  }

  if (errorMessage.includes("Unterminated string")) {
    hints.push(
      "Hint: Make sure all strings are properly closed with matching quotes.",
    );
  }

  if (
    errorMessage.includes("Unexpected end") ||
    errorMessage.includes("Unexpected EOF")
  ) {
    hints.push(
      "Hint: Check that all braces {} and brackets [] are properly closed.",
    );
  }

  // Check for single quotes
  if (errorMessage.includes("Single quotes") || content.includes("'")) {
    hints.push(
      "Hint: Use double quotes (\") instead of single quotes (') for strings in JSON.",
    );
  }

  return hints;
}

/**
 * Provides examples for common Zod validation errors
 * @param error - The ZodError to analyze
 * @returns Array of helpful examples
 */
function getValidationExamples(error: ZodError): string[] {
  const examples: string[] = [];
  const seenPaths = new Set<string>();

  for (const issue of error.issues) {
    const path = issue.path.join(".");

    if (seenPaths.has(path)) continue;
    seenPaths.add(path);

    if (path === "permissions.allow" || path === "permissions.deny") {
      examples.push(`  "permissions": {
    "allow": ["Bash", "Read", "Write"],
    "deny": ["WebFetch"]
  }`);
    } else if (path.startsWith("hooks")) {
      examples.push(`  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{ "type": "command", "command": "echo Starting..." }]
    }]
  }`);
    } else if (path === "env") {
      examples.push(`  "env": {
    "DEBUG": "true",
    "API_URL": "https://example.com"
  }`);
    }
  }

  return examples;
}
