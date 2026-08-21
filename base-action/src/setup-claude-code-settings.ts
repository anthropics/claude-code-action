import { $ } from "bun";
import { homedir } from "os";
import { readFile } from "fs/promises";
import { parseJsonWithLocation } from "./validate-json";

export async function setupClaudeCodeSettings(
  settingsInput?: string,
  homeDir?: string,
) {
  const home = homeDir ?? homedir();
  const settingsPath = `${home}/.claude/settings.json`;
  console.log(`Setting up Claude settings at: ${settingsPath}`);

  console.log(`Creating .claude directory...`);
  await $`mkdir -p ${home}/.claude`.quiet();

  let settings = await loadExistingSettings(settingsPath);

  if (settingsInput && settingsInput.trim()) {
    const inputSettings = await loadInputSettings(settingsInput);
    settings = { ...settings, ...inputSettings };
    console.log(`Merged settings with input settings`);
  }

  settings.enableAllProjectMcpServers = true;
  console.log(`Updated settings with enableAllProjectMcpServers: true`);

  await $`echo ${JSON.stringify(settings, null, 2)} > ${settingsPath}`.quiet();
  console.log(`Settings saved successfully`);
}

async function loadExistingSettings(
  settingsPath: string,
): Promise<Record<string, unknown>> {
  let existingContent: string;
  try {
    existingContent = await readFile(settingsPath, "utf-8");
  } catch (error) {
    if (isFileNotFoundError(error)) {
      console.log(`No existing settings file found, creating new one`);
      return {};
    }
    throw error;
  }

  if (!existingContent.trim()) {
    console.log(`Settings file exists but is empty`);
    return {};
  }

  const settings = parseJsonWithLocation<Record<string, unknown>>(
    existingContent,
    settingsPath,
  );
  console.log(`Found existing settings:`, JSON.stringify(settings, null, 2));
  return settings;
}

async function loadInputSettings(
  settingsInput: string,
): Promise<Record<string, unknown>> {
  console.log(`Processing settings input...`);

  if (looksLikeJsonObject(settingsInput)) {
    const parsed = parseJsonWithLocation<Record<string, unknown>>(
      settingsInput,
      "settings input",
    );
    console.log(`Parsed settings input as JSON`);
    return parsed;
  }

  console.log(
    `Settings input is not JSON, treating as file path: ${settingsInput}`,
  );
  let fileContent: string;
  try {
    fileContent = await readFile(settingsInput, "utf-8");
  } catch (fileError) {
    throw new Error(
      `Failed to read settings file at "${settingsInput}": ${fileError}`,
    );
  }

  const parsed = parseJsonWithLocation<Record<string, unknown>>(
    fileContent,
    settingsInput,
  );
  console.log(`Successfully read and parsed settings from file`);
  return parsed;
}

function looksLikeJsonObject(value: string): boolean {
  return value.trim().startsWith("{");
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "ENOENT"
  );
}
