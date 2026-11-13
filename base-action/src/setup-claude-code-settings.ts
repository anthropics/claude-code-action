import { $ } from "bun";
import * as core from "@actions/core";
import { homedir } from "os";
import { readFile } from "fs/promises";

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
  let existingSettings: string | undefined;
  try {
    existingSettings = await readFile(settingsPath, "utf-8");
  } catch (e) {
    console.log(`No existing settings file found, creating new one`);
  }

  if (existingSettings !== undefined) {
    if (existingSettings.trim()) {
      try {
        settings = JSON.parse(existingSettings);
        console.log(
          `Found existing settings:`,
          JSON.stringify(settings, null, 2),
        );
      } catch (e) {
        core.warning(
          `Existing settings file ${settingsPath} contains invalid JSON and will be overwritten: ${e instanceof Error ? e.message : e}`,
        );
      }
    } else {
      console.log(`Settings file exists but is empty`);
    }
  }

  // Handle settings input (either file path or JSON string)
  if (settingsInput && settingsInput.trim()) {
    console.log(`Processing settings input...`);
    let inputSettings: Record<string, unknown> = {};

    try {
      // First try to parse as JSON
      inputSettings = JSON.parse(settingsInput);
      console.log(`Parsed settings input as JSON`);
    } catch (e) {
      // Input that looks like JSON but fails to parse is a syntax error, not a path
      if (/^\s*[{[]/.test(settingsInput)) {
        throw new Error(
          `Invalid JSON in settings input: ${e instanceof Error ? e.message : e}`,
        );
      }
      // If not JSON, treat as file path
      console.log(
        `Settings input is not JSON, treating as file path: ${settingsInput}`,
      );
      try {
        const fileContent = await readFile(settingsInput, "utf-8");
        inputSettings = JSON.parse(fileContent);
        console.log(`Successfully read and parsed settings from file`);
      } catch (fileError) {
        console.error(`Failed to read or parse settings file: ${fileError}`);
        throw new Error(
          `Failed to process settings input ${settingsInput}: ${fileError}`,
        );
      }
    }

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
