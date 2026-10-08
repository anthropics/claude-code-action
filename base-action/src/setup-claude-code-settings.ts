import { $ } from "bun";
import { homedir } from "os";
import type { ClaudeSettings } from "./schemas/settings-schema";
import {
  validateExistingSettings,
  processSettingsInput,
} from "./validation/settings";

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

  let settings: Partial<ClaudeSettings> = {};

  // Load and validate existing settings
  try {
    const existingSettings = await $`cat ${settingsPath}`.quiet().text();
    if (existingSettings.trim()) {
      settings = validateExistingSettings(existingSettings);
      console.log(
        `Found existing settings:`,
        JSON.stringify(settings, null, 2),
      );
    } else {
      console.log(`Settings file exists but is empty`);
    }
  } catch (e) {
    if (
      e instanceof Error &&
      e.message.includes("Cannot proceed with invalid")
    ) {
      throw e; // Re-throw settings validation errors
    }
    console.log(`No existing settings file found, creating new one`);
  }

  // Process input settings if provided
  if (settingsInput && settingsInput.trim()) {
    console.log(`Processing settings input...`);
    const inputSettings = await processSettingsInput(settingsInput);

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
