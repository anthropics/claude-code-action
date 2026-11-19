import { $ } from "bun";
import { homedir } from "os";
import { readFile } from "fs/promises";

/**
 * Validates and parses the settings input string.
 * Supports:
 *  1. Inline JSON strings (must parse to a JSON object dictionary)
 *  2. File paths pointing to a JSON configuration file
 */
export async function parseSettingsInput(
  rawInput: string,
): Promise<Record<string, unknown>> {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {};
  }

  // If input starts with '{' or '[', it is intended as inline JSON syntax
  const isLikelyInlineJson = trimmed.startsWith("{") || trimmed.startsWith("[");

  if (isLikelyInlineJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse inline settings JSON: ${msg}`);
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error(
        `Invalid settings format: expected a JSON object dictionary, received ${Array.isArray(parsed) ? "array" : typeof parsed}`,
      );
    }

    return parsed as Record<string, unknown>;
  }

  // Otherwise, treat as a configuration file path
  console.log(`Treating settings input as file path: ${trimmed}`);
  let fileContent: string;
  try {
    fileContent = await readFile(trimmed, "utf-8");
  } catch (fileErr) {
    const code = (fileErr as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      throw new Error(
        `Settings input is neither valid inline JSON nor an existing file path: '${trimmed}'`,
      );
    }
    const msg = fileErr instanceof Error ? fileErr.message : String(fileErr);
    throw new Error(`Failed to read settings file '${trimmed}': ${msg}`);
  }

  let parsedFromFile: unknown;
  try {
    parsedFromFile = JSON.parse(fileContent);
  } catch (jsonErr) {
    const msg = jsonErr instanceof Error ? jsonErr.message : String(jsonErr);
    throw new Error(
      `Failed to parse settings JSON from file '${trimmed}': ${msg}`,
    );
  }

  if (
    typeof parsedFromFile !== "object" ||
    parsedFromFile === null ||
    Array.isArray(parsedFromFile)
  ) {
    throw new Error(
      `Invalid settings file format in '${trimmed}': expected a JSON object dictionary, received ${Array.isArray(parsedFromFile) ? "array" : typeof parsedFromFile}`,
    );
  }

  return parsedFromFile as Record<string, unknown>;
}

export async function setupClaudeCodeSettings(
  settingsInput?: string,
  homeDir?: string,
) {
  const home = homeDir ?? homedir();
  const settingsPath = `${home}/.claude/settings.json`;
  console.log(`Setting up Claude settings at: ${settingsPath}`);

  // Ensure .claude directory exists
  console.log(`Creating .claude directory...`);
  await $`mkdir -p ${home}/.claude`.quiet();

  let settings: Record<string, unknown> = {};
  try {
    const existingSettings = await $`cat ${settingsPath}`.quiet().text();
    if (existingSettings.trim()) {
      settings = JSON.parse(existingSettings);
      console.log(
        `Found existing settings:`,
        JSON.stringify(settings, null, 2),
      );
    } else {
      console.log(`Settings file exists but is empty`);
    }
  } catch (e) {
    console.log(`No existing settings file found, creating new one`);
  }

  // Handle settings input (either file path or JSON string)
  if (settingsInput && settingsInput.trim()) {
    console.log(`Processing settings input...`);
    const inputSettings = await parseSettingsInput(settingsInput);
    console.log(`Successfully processed input settings`);

    // Merge input settings with existing settings
    settings = { ...settings, ...inputSettings };
    console.log(`Merged settings with input settings`);
  }

  // Always set enableAllProjectMcpServers to true
  settings.enableAllProjectMcpServers = true;
  console.log(`Updated settings with enableAllProjectMcpServers: true`);

  await $`echo ${JSON.stringify(settings, null, 2)} > ${settingsPath}`.quiet();
  console.log(`Settings saved successfully`);
}
