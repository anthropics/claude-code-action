import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { getClaudePath } from "./installer.js";

// Security constants from base-action
const PLUGIN_NAME_REGEX = /^[@a-zA-Z0-9_\-/.]+$/;
const MAX_PLUGIN_NAME_LENGTH = 512;
const PATH_TRAVERSAL_REGEX =
  /\.\.\/|\/\.\.|\.\/|\/\.|(?:^|\/)\.\.$|(?:^|\/)\.$|\.\.(?![0-9])/;

/**
 * Validates a plugin/marketplace name for security issues
 * Prevents command injection and path traversal attacks
 * @param name - The plugin or marketplace name to validate
 * @throws {Error} If the name is invalid
 */
function validateName(name: string): void {
  // Normalize Unicode to prevent homoglyph attacks
  const normalized = name.normalize("NFC");

  if (normalized.length > MAX_PLUGIN_NAME_LENGTH) {
    throw new Error(`Name too long: ${normalized.substring(0, 50)}...`);
  }

  if (!PLUGIN_NAME_REGEX.test(normalized)) {
    throw new Error(`Invalid name format: ${name}`);
  }

  // Prevent path traversal attacks
  if (PATH_TRAVERSAL_REGEX.test(normalized)) {
    throw new Error(`Invalid name format (path traversal detected): ${name}`);
  }
}

/**
 * Parse comma or newline-separated input into array with validation
 */
function parseInput(input: string): string[] {
  if (!input || input.trim() === "") {
    return [];
  }

  return input
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter((item) => {
      if (item.length === 0) return false;
      validateName(item);
      return true;
    });
}

/**
 * Configure git credentials for GitHub token access
 */
async function configureGitCredentials(githubToken: string): Promise<void> {
  if (!githubToken) {
    return;
  }

  core.info("Configuring git credentials for plugin repositories");

  // Configure git to use the GitHub token
  await exec.exec("git", [
    "config",
    "--global",
    "url.https://x-access-token:" + githubToken + "@github.com/.insteadOf",
    "git@github.com:",
  ]);

  await exec.exec("git", [
    "config",
    "--global",
    "url.https://x-access-token:" + githubToken + "@github.com/.insteadOf",
    "ssh://git@github.com/",
  ]);
}

/**
 * Add plugin marketplaces
 */
export async function addMarketplaces(
  marketplaces: string,
  githubToken: string,
): Promise<number> {
  const marketplaceList = parseInput(marketplaces);

  if (marketplaceList.length === 0) {
    core.info("No marketplaces to add");
    return 0;
  }

  // Configure git credentials if token is provided
  await configureGitCredentials(githubToken);

  const claudePath = getClaudePath();
  let addedCount = 0;

  for (const marketplace of marketplaceList) {
    core.info(`Adding marketplace: ${marketplace}`);

    try {
      await exec.exec(claudePath, ["marketplace", "add", marketplace]);
      addedCount++;
      core.info(`Successfully added marketplace: ${marketplace}`);
    } catch (error) {
      core.warning(`Failed to add marketplace ${marketplace}: ${error}`);
    }
  }

  core.info(`Added ${addedCount} marketplace(s)`);
  return addedCount;
}

/**
 * Install plugins
 */
export async function installPlugins(plugins: string): Promise<string[]> {
  const pluginList = parseInput(plugins);

  if (pluginList.length === 0) {
    core.info("No plugins to install");
    return [];
  }

  const claudePath = getClaudePath();
  const installedPlugins: string[] = [];

  for (const plugin of pluginList) {
    core.info(`Installing plugin: ${plugin}`);

    try {
      await exec.exec(claudePath, ["plugin", "install", plugin]);
      installedPlugins.push(plugin);
      core.info(`Successfully installed plugin: ${plugin}`);
    } catch (error) {
      core.warning(`Failed to install plugin ${plugin}: ${error}`);
    }
  }

  core.info(`Installed ${installedPlugins.length} plugin(s)`);
  return installedPlugins;
}
