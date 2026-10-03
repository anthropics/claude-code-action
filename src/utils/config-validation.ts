import * as core from "@actions/core";
import { readFile } from "fs/promises";

/**
 * Validation result for configuration checks.
 */
export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

/**
 * Try to extract a line number and contextual information from a JSON parse error.
 * JSON.parse error messages vary by runtime; this handles the common Bun/V8 patterns.
 */
function extractJsonErrorDetails(
  rawJson: string,
  error: unknown,
): { line: number; column: number; context: string } | null {
  const message = error instanceof Error ? error.message : String(error);

  // Bun / V8 typically include "at position <N>" or "at line <L> column <C>"
  const posMatch = message.match(/position\s+(\d+)/i);
  const lineColMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);

  let line = -1;
  let column = -1;

  if (lineColMatch) {
    line = parseInt(lineColMatch[1]!, 10);
    column = parseInt(lineColMatch[2]!, 10);
  } else if (posMatch) {
    const position = parseInt(posMatch[1]!, 10);
    // Convert byte offset to line/column
    const upToPos = rawJson.slice(0, position);
    const lines = upToPos.split("\n");
    line = lines.length;
    column = (lines[lines.length - 1]?.length ?? 0) + 1;
  }

  if (line < 1) return null;

  // Build a short context snippet around the error line
  const allLines = rawJson.split("\n");
  const errorLineIdx = Math.min(line - 1, allLines.length - 1);
  const contextLines: string[] = [];
  for (
    let i = Math.max(0, errorLineIdx - 1);
    i <= Math.min(allLines.length - 1, errorLineIdx + 1);
    i++
  ) {
    const prefix = i === errorLineIdx ? ">>>" : "   ";
    contextLines.push(`${prefix} ${i + 1} | ${allLines[i]}`);
  }

  return { line, column, context: contextLines.join("\n") };
}

/**
 * Validate a JSON string intended for `.claude/settings.json`.
 *
 * Returns a structured result with errors/warnings instead of throwing,
 * so the caller can decide how to surface them (annotation, log, or throw).
 */
export function validateSettingsJson(jsonString: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const trimmed = jsonString.trim();
  if (!trimmed) {
    return { valid: true, errors, warnings };
  }

  // Attempt to parse
  try {
    const parsed = JSON.parse(trimmed);

    // Must be an object, not an array or primitive
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      errors.push(
        "settings.json must be a JSON object (e.g. { ... }), " +
          `but got ${Array.isArray(parsed) ? "an array" : typeof parsed}.`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const details = extractJsonErrorDetails(trimmed, error);

    if (details) {
      errors.push(
        `Invalid JSON in settings configuration (line ${details.line}, column ${details.column}): ${message}\n\n${details.context}`,
      );
    } else {
      errors.push(`Invalid JSON in settings configuration: ${message}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a settings input that may be a JSON string or a file path.
 *
 * This mirrors the logic in `setupClaudeCodeSettings` but performs
 * validation only (no side effects) and returns actionable error messages.
 */
export async function validateSettingsInput(
  settingsInput: string | undefined,
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!settingsInput || !settingsInput.trim()) {
    return { valid: true, errors, warnings };
  }

  const trimmed = settingsInput.trim();

  // Try parsing as JSON first
  try {
    JSON.parse(trimmed);
    // If it parses, validate its structure
    const jsonResult = validateSettingsJson(trimmed);
    errors.push(...jsonResult.errors);
    warnings.push(...jsonResult.warnings);
  } catch {
    // Not valid JSON -- treat as file path
    try {
      const fileContent = await readFile(trimmed, "utf-8");
      const jsonResult = validateSettingsJson(fileContent);
      if (!jsonResult.valid) {
        // Prefix errors with the file path for clarity
        for (const err of jsonResult.errors) {
          errors.push(`In settings file "${trimmed}": ${err}`);
        }
      }
      warnings.push(...jsonResult.warnings);
    } catch (fileError) {
      const fileMessage =
        fileError instanceof Error ? fileError.message : String(fileError);
      // Check if it looks like it was intended to be JSON (starts with { or [)
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        errors.push(
          `Settings input looks like JSON but failed to parse: ${fileMessage}\n` +
            `Hint: Check for trailing commas, missing quotes, or unescaped characters.`,
        );
      } else {
        errors.push(
          `Settings input is not valid JSON and could not be read as a file path: ${fileMessage}`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Detect common mistakes in the `claude_args` value that relate to allowed_tools.
 *
 * A frequent mistake is using YAML block-scalar pipe (`|`) notation with list
 * syntax (leading hyphens) inside `claude_args`. For example:
 *
 * ```yaml
 * claude_args: |
 *   --allowed-tools
 *   - Read
 *   - Grep
 * ```
 *
 * The hyphens become part of the argument tokens and are interpreted as flags
 * rather than tool names, silently producing wrong results.
 */
export function validateClaudeArgs(claudeArgs: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!claudeArgs?.trim()) {
    return { valid: true, errors, warnings };
  }

  const lines = claudeArgs.split("\n");

  // Pattern 1: Detect YAML-list-style entries after --allowed-tools / --allowedTools
  // Look for lines that are just "- SomeTool" (YAML list items)
  let inAllowedToolsBlock = false;
  const yamlListLines: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();

    // Track when we enter an allowed-tools flag
    if (
      line === "--allowed-tools" ||
      line === "--allowedTools" ||
      line.startsWith("--allowed-tools ") ||
      line.startsWith("--allowedTools ")
    ) {
      inAllowedToolsBlock = true;
      continue;
    }

    // Reset when we hit another flag
    if (line.startsWith("--") && !line.startsWith("---")) {
      inAllowedToolsBlock = false;
      continue;
    }

    // If we're in an allowed-tools block and see "- something", that's a YAML list mistake
    if (inAllowedToolsBlock && /^-\s+\S/.test(line)) {
      yamlListLines.push(i + 1);
    }
  }

  if (yamlListLines.length > 0) {
    const lineNums = yamlListLines.join(", ");
    warnings.push(
      `claude_args appears to use YAML list syntax (leading "- ") for tool names on line(s) ${lineNums}. ` +
        `This will not work correctly -- tool names will be interpreted as flags. ` +
        `Use space-separated or comma-separated values instead:\n\n` +
        `  claude_args: |\n` +
        `    --allowed-tools "Read" "Grep" "Bash"\n\n` +
        `  or:\n\n` +
        `  claude_args: --allowed-tools "Read,Grep,Bash"`,
    );
  }

  // Pattern 2: Detect tool names that start with a dash (likely "- Tool" that
  // got concatenated into "-Tool" via YAML folding)
  const toolFlagPattern =
    /--(?:allowed-tools|allowedTools|disallowed-tools|disallowedTools)\s+/g;
  let match;
  while ((match = toolFlagPattern.exec(claudeArgs)) !== null) {
    const afterFlag = claudeArgs.slice(match.index + match[0].length);
    // Check if the first value token looks like a hyphenated list item
    const firstToken = afterFlag.match(/^["']?(-\S+)/);
    if (
      firstToken &&
      !firstToken[1]!.startsWith("--") &&
      firstToken[1] !== "-"
    ) {
      warnings.push(
        `A tool name "${firstToken[1]}" starts with a hyphen, which looks like a YAML list artifact. ` +
          `Did you mean to write the tool name without the leading dash?`,
      );
    }
  }

  return { valid: errors.length === 0 && warnings.length === 0, errors, warnings };
}

/**
 * Run all config validations and surface results via GitHub Actions annotations.
 *
 * Warnings are emitted as `core.warning()` (yellow annotation in the Actions UI).
 * Errors are emitted as `core.error()` and the function returns false so the
 * caller can decide whether to abort.
 */
export async function validateAndAnnotateConfig(options: {
  settingsInput?: string;
  claudeArgs?: string;
}): Promise<boolean> {
  let hasErrors = false;

  // Validate settings input
  const settingsResult = await validateSettingsInput(options.settingsInput);
  for (const err of settingsResult.errors) {
    core.error(`Configuration error: ${err}`);
    hasErrors = true;
  }
  for (const warn of settingsResult.warnings) {
    core.warning(`Configuration warning: ${warn}`);
  }

  // Validate claude_args
  const argsResult = validateClaudeArgs(options.claudeArgs ?? "");
  for (const err of argsResult.errors) {
    core.error(`Configuration error: ${err}`);
    hasErrors = true;
  }
  for (const warn of argsResult.warnings) {
    core.warning(`Configuration warning: ${warn}`);
  }

  return !hasErrors;
}
