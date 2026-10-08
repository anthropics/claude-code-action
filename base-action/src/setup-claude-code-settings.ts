import { $ } from "bun";
import { homedir } from "os";
import { readFile } from "fs/promises";

// Env vars that resolve a model alias (sonnet/opus/haiku) to a concrete
// model id or proxy preset. The Agent SDK's top-level call inherits these
// from process.env, but spawned sub-call subprocesses (Task tool, sub-agents)
// have historically dropped them and fallen back to the SDK's hardcoded
// default — e.g. routing to literal `claude-sonnet-4-6` even when the user
// opted into a non-Anthropic preset via ANTHROPIC_DEFAULT_SONNET_MODEL.
// Mirroring these into settings.env guarantees the CLI propagates them to
// every session, including sub-calls, via the documented settings layer.
// See: https://github.com/anthropics/claude-code-action/issues/1258
const MODEL_ALIAS_ENV_VARS = [
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
] as const;

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

  // Forward model-alias env vars into settings.env so the CLI propagates them
  // to every session (top-level + sub-calls). User-provided settings.env
  // entries take precedence; we only fill in keys the user didn't already set.
  const userEnv =
    typeof settings.env === "object" && settings.env !== null
      ? (settings.env as Record<string, string>)
      : undefined;
  const mergedEnv: Record<string, string> = { ...(userEnv ?? {}) };
  const injectedKeys: string[] = [];
  for (const key of MODEL_ALIAS_ENV_VARS) {
    const value = process.env[key];
    if (value && !(key in mergedEnv)) {
      mergedEnv[key] = value;
      injectedKeys.push(key);
    }
  }
  if (injectedKeys.length > 0 || userEnv) {
    settings.env = mergedEnv;
    if (injectedKeys.length > 0) {
      console.log(
        `Forwarded model-alias env vars to settings.env: ${injectedKeys.join(", ")}`,
      );
    }
  }

  await $`echo ${JSON.stringify(settings, null, 2)} > ${settingsPath}`.quiet();
  console.log(`Settings saved successfully`);
}
