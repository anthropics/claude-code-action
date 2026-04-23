import { $ } from "bun";
import { homedir } from "os";
import { readFile } from "fs/promises";

// Under pull_request_target/workflow_run/issue_comment, project config in the
// workspace may not match the base ref; default to user-level only and let
// callers opt in. issue_comment runs from the default branch with base-repo
// context, same class as pull_request_target.
function isPrivilegedExternalEvent(): boolean {
  const e = process.env.GITHUB_EVENT_NAME ?? "";
  return (
    e === "pull_request_target" ||
    e === "workflow_run" ||
    e === "issue_comment"
  );
}

export function resolveEnableAllProjectMcpServers(
  inputValue: string | undefined,
): boolean {
  if (inputValue === "true") return true;
  if (inputValue === "false") return false;
  return !isPrivilegedExternalEvent();
}

export async function setupClaudeCodeSettings(
  settingsInput?: string,
  homeDir?: string,
  enableAllProjectMcpServers: boolean = !isPrivilegedExternalEvent(),
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

  // enableAllProjectMcpServers controls whether Claude Code auto-loads every
  // server in the checkout's .mcp.json. Defaults to true except under
  // pull_request_target/workflow_run/issue_comment; the
  // enable_all_project_mcp_servers action input always overrides.
  settings.enableAllProjectMcpServers = enableAllProjectMcpServers;
  console.log(
    `Updated settings with enableAllProjectMcpServers: ${enableAllProjectMcpServers}`,
  );

  await $`echo ${JSON.stringify(settings, null, 2)} > ${settingsPath}`.quiet();
  console.log(`Settings saved successfully`);
}
