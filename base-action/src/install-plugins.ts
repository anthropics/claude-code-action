import { spawn, ChildProcess } from "child_process";

const PLUGIN_NAME_REGEX = /^[@a-zA-Z0-9_\-\/\.]+$/;
const MAX_PLUGIN_NAME_LENGTH = 512;
const PATH_TRAVERSAL_REGEX =
  /\.\.\/|\/\.\.|\.\/|\/\.|(?:^|\/)\.\.$|(?:^|\/)\.$|\.\.(?![0-9])/;
const MARKETPLACE_URL_REGEX =
  /^https:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+\.git$/;

/**
 * Checks if a marketplace input is a local path (not a URL)
 * @param input - The marketplace input to check
 * @returns true if the input is a local path, false if it's a URL
 */
function isLocalPath(input: string): boolean {
  // Local paths start with ./, ../, /, or a drive letter (Windows)
  return (
    input.startsWith("./") ||
    input.startsWith("../") ||
    input.startsWith("/") ||
    /^[a-zA-Z]:[\\\/]/.test(input)
  );
}

/**
 * Validates a marketplace URL or local path
 * @param input - The marketplace URL or local path to validate
 * @throws {Error} If the input is invalid
 */
function validateMarketplaceInput(input: string): void {
  const normalized = input.trim();

  if (!normalized) {
    throw new Error("Marketplace URL or path cannot be empty");
  }

  // Local paths are passed directly to Claude Code which handles them
  if (isLocalPath(normalized)) {
    return;
  }

  // Validate as URL
  if (!MARKETPLACE_URL_REGEX.test(normalized)) {
    throw new Error(`Invalid marketplace URL format: ${input}`);
  }

  // Additional check for valid URL structure
  try {
    new URL(normalized);
  } catch {
    throw new Error(`Invalid marketplace URL: ${input}`);
  }
}

/**
 * Validates a plugin name for security issues
 * @param pluginName - The plugin name to validate
 * @throws {Error} If the plugin name is invalid
 */
function validatePluginName(pluginName: string): void {
  // Normalize Unicode to prevent homoglyph attacks (e.g., fullwidth dots, Unicode slashes)
  const normalized = pluginName.normalize("NFC");

  if (normalized.length > MAX_PLUGIN_NAME_LENGTH) {
    throw new Error(`Plugin name too long: ${normalized.substring(0, 50)}...`);
  }

  if (!PLUGIN_NAME_REGEX.test(normalized)) {
    throw new Error(`Invalid plugin name format: ${pluginName}`);
  }

  // Prevent path traversal attacks with single efficient regex check
  if (PATH_TRAVERSAL_REGEX.test(normalized)) {
    throw new Error(`Invalid plugin name format: ${pluginName}`);
  }
}

/**
 * Parse a newline-separated list of marketplace URLs or local paths and return an array of validated entries
 * @param marketplaces - Newline-separated list of marketplace Git URLs or local paths
 * @returns Array of validated marketplace URLs or paths (empty array if none provided)
 */
function parseMarketplaces(marketplaces?: string): string[] {
  const trimmed = marketplaces?.trim();

  if (!trimmed) {
    return [];
  }

  // Split by newline and process each entry
  return trimmed
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => {
      if (entry.length === 0) return false;

      validateMarketplaceInput(entry);
      return true;
    });
}

/**
 * Parse a newline-separated list of plugin names and return an array of trimmed, non-empty plugin names
 * Validates plugin names to prevent command injection and path traversal attacks
 * Allows: letters, numbers, @, -, _, /, . (common npm/scoped package characters)
 * Disallows: path traversal (../, ./), shell metacharacters, and consecutive dots
 * @param plugins - Newline-separated list of plugin names, or undefined/empty to return empty array
 * @returns Array of validated plugin names (empty array if none provided)
 * @throws {Error} If any plugin name fails validation
 */
function parsePlugins(plugins?: string): string[] {
  const trimmedPlugins = plugins?.trim();

  if (!trimmedPlugins) {
    return [];
  }

  // Split by newline and process each plugin
  return trimmedPlugins
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => {
      if (p.length === 0) return false;

      validatePluginName(p);
      return true;
    });
}

/**
 * Executes a Claude Code CLI command with proper error handling
 * @param claudeExecutable - Path to the Claude executable
 * @param args - Command arguments to pass to the executable
 * @param errorContext - Context string for error messages (e.g., "Failed to install plugin 'foo'")
 * @returns Promise that resolves when the command completes successfully
 * @throws {Error} If the command fails to execute
 */
async function executeClaudeCommand(
  claudeExecutable: string,
  args: string[],
  errorContext: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const childProcess: ChildProcess = spawn(claudeExecutable, args, {
      stdio: "inherit",
    });

    childProcess.on("close", (code: number | null) => {
      if (code === 0) {
        resolve();
      } else if (code === null) {
        reject(new Error(`${errorContext}: process terminated by signal`));
      } else {
        reject(new Error(`${errorContext} (exit code: ${code})`));
      }
    });

    childProcess.on("error", (err: Error) => {
      reject(new Error(`${errorContext}: ${err.message}`));
    });
  });
}

/**
 * Installs a single Claude Code plugin
 * @param pluginName - The name of the plugin to install
 * @param claudeExecutable - Path to the Claude executable
 * @returns Promise that resolves when the plugin is installed successfully
 * @throws {Error} If the plugin installation fails
 */
async function installPlugin(
  pluginName: string,
  claudeExecutable: string,
): Promise<void> {
  console.log(`Installing plugin: ${pluginName}`);

  return executeClaudeCommand(
    claudeExecutable,
    ["plugin", "install", pluginName],
    `Failed to install plugin '${pluginName}'`,
  );
}

/**
 * Adds a Claude Code plugin marketplace
 * @param claudeExecutable - Path to the Claude executable
 * @param marketplace - The marketplace Git URL or local path to add
 * @returns Promise that resolves when the marketplace add command completes
 * @throws {Error} If the command fails to execute
 */
async function addMarketplace(
  claudeExecutable: string,
  marketplace: string,
): Promise<void> {
  console.log(`Adding marketplace: ${marketplace}`);

  return executeClaudeCommand(
    claudeExecutable,
    ["plugin", "marketplace", "add", marketplace],
    `Failed to add marketplace '${marketplace}'`,
  );
}

/**
 * Installs Claude Code plugins from a newline-separated list
 * @param marketplacesInput - Newline-separated list of marketplace Git URLs or local paths
 * @param pluginsInput - Newline-separated list of plugin names
 * @param claudeExecutable - Path to the Claude executable (defaults to "claude")
 * @returns Promise that resolves when all plugins are installed
 * @throws {Error} If any plugin fails validation or installation (stops on first error)
 */
export async function installPlugins(
  marketplacesInput?: string,
  pluginsInput?: string,
  claudeExecutable?: string,
): Promise<void> {
  // Resolve executable path with explicit fallback
  const resolvedExecutable = claudeExecutable || "claude";

  // Parse and add all marketplaces before installing plugins
  const marketplaces = parseMarketplaces(marketplacesInput);

  if (marketplaces.length > 0) {
    console.log(`Adding ${marketplaces.length} marketplace(s)...`);
    for (const marketplace of marketplaces) {
      await addMarketplace(resolvedExecutable, marketplace);
      console.log(`✓ Successfully added marketplace: ${marketplace}`);
    }
  } else {
    console.log("No marketplaces specified, skipping marketplace setup");
  }

  const plugins = parsePlugins(pluginsInput);
  if (plugins.length > 0) {
    console.log(`Installing ${plugins.length} plugin(s)...`);
    for (const plugin of plugins) {
      await installPlugin(plugin, resolvedExecutable);
      console.log(`✓ Successfully installed: ${plugin}`);
    }
  } else {
    console.log("No plugins specified, skipping plugins installation");
  }
}
