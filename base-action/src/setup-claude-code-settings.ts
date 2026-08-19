import { mkdir, mkdtemp, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

async function resolveClaudeConfigDir(homeDir?: string): Promise<string> {
  const configuredDir = process.env.CLAUDE_CONFIG_DIR?.trim();
  if (configuredDir) {
    process.env.CLAUDE_CONFIG_DIR = configuredDir;
    return configuredDir;
  }

  const baseDir = process.env.RUNNER_TEMP?.trim() || homeDir || tmpdir();
  await mkdir(baseDir, { recursive: true });

  const sessionDir = await mkdtemp(join(baseDir, "claude-code-action-"));
  process.env.CLAUDE_CONFIG_DIR = sessionDir;
  console.log(`Using session-scoped Claude config directory: ${sessionDir}`);
  return sessionDir;
}

export function prependSettingsArgToClaudeArgs(
  claudeArgs: string | undefined,
  settingsPath: string,
): string {
  const settingsArg = `--settings ${JSON.stringify(settingsPath)}`;
  const trimmedArgs = claudeArgs?.trim();
  return trimmedArgs ? `${settingsArg}\n${trimmedArgs}` : settingsArg;
}

export async function setupClaudeCodeSettings(
  settingsInput?: string,
  homeDir?: string,
): Promise<string> {
  const configDir = await resolveClaudeConfigDir(homeDir);
  const settingsPath = join(configDir, "settings.json");
  console.log(`Setting up Claude settings at: ${settingsPath}`);

  console.log(`Creating Claude config directory...`);
  await mkdir(configDir, { recursive: true });

  let settings: Record<string, unknown> = {};
  try {
    const existingSettings = await readFile(settingsPath, "utf-8");
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
    let inputSettings: Record<string, unknown> = {};

    try {
      // First try to parse as JSON
      inputSettings = JSON.parse(settingsInput);
      console.log(`Parsed settings input as JSON`);
    } catch (e) {
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
        throw new Error(`Failed to process settings input: ${fileError}`);
      }
    }

    // Merge input settings with existing settings
    settings = { ...settings, ...inputSettings };
    console.log(`Merged settings with input settings`);
  }

  // Always set enableAllProjectMcpServers to true
  settings.enableAllProjectMcpServers = true;
  console.log(`Updated settings with enableAllProjectMcpServers: true`);

  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  console.log(`Settings saved successfully`);
  return settingsPath;
}
