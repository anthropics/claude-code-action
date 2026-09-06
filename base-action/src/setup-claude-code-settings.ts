import { $ } from "bun";
import { homedir } from "os";
import { readFile } from "fs/promises";

function parseSettingsJson(
  contents: string,
  source: string,
): Record<string, unknown> {
  try {
    return JSON.parse(contents);
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Unknown parse error";
    throw new Error(`Invalid JSON in ${source}: ${reason}`);
  }
}

function isInlineJsonInput(input: string): boolean {
  const trimmedInput = input.trim();
  return trimmedInput.startsWith("{") || trimmedInput.startsWith("[");
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
    const existingSettings = await readFile(settingsPath, "utf-8");
    if (existingSettings.trim()) {
      settings = parseSettingsJson(
        existingSettings,
        "the existing Claude settings file",
      );
      console.log(
        `Found existing settings:`,
        JSON.stringify(settings, null, 2),
      );
    } else {
      console.log(`Settings file exists but is empty`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.log(`No existing settings file found, creating new one`);
    } else {
      throw error;
    }
  }

  // Handle settings input (either file path or JSON string)
  if (settingsInput && settingsInput.trim()) {
    console.log(`Processing settings input...`);
    let inputSettings: Record<string, unknown> = {};

    if (isInlineJsonInput(settingsInput)) {
      inputSettings = parseSettingsJson(settingsInput, "inline settings input");
      console.log(`Parsed settings input as JSON`);
    } else {
      console.log(`Treating settings input as a file path: ${settingsInput}`);
      try {
        const fileContent = await readFile(settingsInput, "utf-8");
        inputSettings = parseSettingsJson(
          fileContent,
          "the settings input file",
        );
        console.log(`Successfully read and parsed settings from file`);
      } catch (fileError) {
        if (
          fileError instanceof Error &&
          fileError.message.startsWith("Invalid JSON in")
        ) {
          throw fileError;
        }
        throw new Error(`Failed to read settings input file: ${fileError}`);
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
