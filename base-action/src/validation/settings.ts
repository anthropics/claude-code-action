import { readFile } from "fs/promises";
import {
  safeValidateSettings,
  type ClaudeSettings,
} from "../schemas/settings-schema";
import {
  formatJsonSyntaxError,
  formatZodValidationError,
} from "../utils/error-formatter";

/**
 * Parses and validates JSON settings from a string
 * @param settingsJson - JSON string containing settings
 * @param source - Source description for error messages
 * @returns Validated settings object
 * @throws Error with detailed message if JSON is invalid or validation fails
 */
export function parseAndValidateSettingsJson(
  settingsJson: string,
  source: string = "settings",
): Partial<ClaudeSettings> {
  try {
    const parsed = JSON.parse(settingsJson);
    const validationResult = safeValidateSettings(parsed);

    if (!validationResult.success) {
      const errorMessage = formatZodValidationError(
        validationResult.error,
        source,
      );
      throw new Error(errorMessage);
    }

    return validationResult.data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw formatJsonSyntaxError(error, settingsJson, source);
    }
    throw error;
  }
}

/**
 * Validates existing settings with optional strict mode
 * @param settingsJson - JSON string containing existing settings
 * @param strict - If true, throws on validation errors. If false, logs warnings and returns parsed data
 * @returns Validated or raw settings object
 * @throws Error if strict mode and validation fails
 */
export function validateExistingSettings(
  settingsJson: string,
  strict: boolean = false,
): Partial<ClaudeSettings> {
  try {
    const parsed = JSON.parse(settingsJson);
    const validationResult = safeValidateSettings(parsed);

    if (!validationResult.success) {
      const errorMessage = formatZodValidationError(
        validationResult.error,
        "existing settings.json",
      );

      if (strict) {
        throw new Error(errorMessage);
      } else {
        console.warn(`Warning: Existing settings file has validation issues:`);
        console.warn(errorMessage);
        console.warn(
          `Using existing settings as-is for backward compatibility.`,
        );
        return parsed;
      }
    }

    return validationResult.data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error(`Error parsing existing settings file:`);
      console.error(
        formatJsonSyntaxError(error, settingsJson, "existing settings.json")
          .message,
      );
      throw new Error(
        `Cannot proceed with invalid existing settings file. Please fix the JSON syntax.`,
      );
    }
    throw error;
  }
}

/**
 * Loads and validates settings from a file path
 * @param filePath - Path to the settings file
 * @returns Validated settings object
 * @throws Error with detailed message if file cannot be read or validation fails
 */
export async function loadAndValidateSettingsFile(
  filePath: string,
): Promise<Partial<ClaudeSettings>> {
  const fileContent = await readFile(filePath, "utf-8");
  return parseAndValidateSettingsJson(fileContent, filePath);
}

/**
 * Processes settings input which can be either a JSON string or file path
 * @param settingsInput - JSON string or path to settings file
 * @returns Validated settings object
 * @throws Error with detailed message if validation fails
 */
export async function processSettingsInput(
  settingsInput: string,
): Promise<Partial<ClaudeSettings>> {
  const trimmedInput = settingsInput.trim();

  // Try to parse as JSON first
  try {
    const settings = parseAndValidateSettingsJson(
      trimmedInput,
      "input settings",
    );
    console.log(`Parsed and validated settings input as JSON`);
    return settings;
  } catch (error) {
    if (error instanceof Error && error.message.includes("JSON syntax error")) {
      // JSON syntax error - might be a file path
      console.log(
        `Settings input is not valid JSON, treating as file path: ${trimmedInput}`,
      );

      try {
        const settings = await loadAndValidateSettingsFile(trimmedInput);
        console.log(`Successfully read and validated settings from file`);
        return settings;
      } catch (fileError) {
        if (
          fileError instanceof Error &&
          fileError.message.includes("ENOENT")
        ) {
          // File doesn't exist - check if input looks like JSON
          if (trimmedInput.startsWith("{") || trimmedInput.startsWith("[")) {
            console.error(
              `Input appears to be malformed JSON rather than a file path.`,
            );
            // Re-throw the original JSON error
            throw error;
          } else {
            console.error(`Failed to read settings file: ${fileError}`);
            console.error(`Original input was also not valid JSON:`);
            console.error((error as Error).message);
            throw new Error(
              `Settings input is neither valid JSON nor a readable file path.`,
            );
          }
        }
        throw fileError;
      }
    }
    throw error;
  }
}
