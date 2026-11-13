import { $ } from "bun";
import { homedir } from "os";
import { readFile } from "fs/promises";
import {
  ORCAROUTER_PROVIDER,
  orcaRouterEnvironment,
  resolveOrcaRouter,
} from "./orcarouter/provider";
import { maskSecret } from "./orcarouter/endpoints";

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

  // When OrcaRouter is the selected provider, inject the resolved credential
  // into user-scope settings.env. This is the single write path for provider
  // credentials: the API-key and PKCE adapters both land here, and the key is
  // never written to a repository-scoped file (which is attacker-controlled on
  // pull requests).
  if (process.env.INPUT_ORCAROUTER_SETTINGS !== "false") {
    const orca = await resolveOrcaRouter();
    if (orca.enabled) {
      if (orca.errors.length > 0) {
        throw new Error(
          `OrcaRouter configuration is incomplete:\n${orca.errors.map((e) => `  - ${e}`).join("\n")}`,
        );
      }
      for (const warning of orca.warnings) console.warn(`Warning: ${warning}`);
      const injected = orcaRouterEnvironment(orca);
      const existingEnv = (settings.env as Record<string, string>) ?? {};
      settings.env = { ...existingEnv, ...injected };
      console.log(
        `Configured OrcaRouter provider (${ORCAROUTER_PROVIDER.displayName}) with credential ${maskSecret(orca.credential?.key)} from ${orca.credential?.source === "pkce" ? "account login" : "API key"}`,
      );
      console.log(
        `Inference base URL: ${orca.origins.apiBaseV1Url}; ${orca.modelOptions.length} compatible model(s) discovered` +
          (orca.degraded ? " (degraded: verified fallback catalog)" : ""),
      );
    }
  }

  await $`echo ${JSON.stringify(settings, null, 2)} > ${settingsPath}`.quiet();
  console.log(`Settings saved successfully`);
}
