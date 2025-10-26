import { spawn, ChildProcess } from "child_process";

const PLUGIN_NAME_REGEX = /^[@a-zA-Z0-9_\-\/\.]+$/;
const MAX_PLUGIN_NAME_LENGTH = 512;
const PATH_TRAVERSAL_REGEX =
  /\.\.\/|\/\.\.|\.\/|\/\.|(?:^|\/)\.\.$|(?:^|\/)\.$|\.\.(?![0-9])/;
const MARKETPLACE_URL_REGEX =
  /^https:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+\.git$/;

/**
 * Validates a marketplace URL for security issues
 * @param url - The marketplace URL to validate
 * @throws {Error} If the URL is invalid
 */
function validateMarketplaceUrl(url: string): void {
  const normalized = url.trim();

  if (!normalized) {
    throw new Error("Marketplace URL cannot be empty");
  }

  if (!MARKETPLACE_URL_REGEX.test(normalized)) {
    throw new Error(`Invalid marketplace URL format: ${url}`);
  }

  // Additional check for valid URL structure
  try {
    new URL(normalized);
  } catch {
    throw new Error(`Invalid marketplace URL: ${url}`);
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
 * Parse a newline-separated list of marketplace URLs and return an array of validated URLs
 * @param marketplaces - Newline-separated list of marketplace Git URLs
 * @returns Array of validated marketplace URLs (empty array if none provided)
 */
function parseMarketplaces(marketplaces?: string): string[] {
  const trimmed = marketplaces?.trim();

  if (!trimmed) {
    return [];
  }

  // Split by newline and process each URL
  return trimmed
    .split("\n")
    .map((url) => url.trim())
    .filter((url) => {
      if (url.length === 0) return false;

      validateMarketplaceUrl(url);
      return true;
    });
}

/**
 * Parse a comma-separated list of plugin names and return an array of trimmed, non-empty plugin names
 * Validates plugin names to prevent command injection and path traversal attacks
 * Allows: letters, numbers, @, -, _, /, . (common npm/scoped package characters)
 * Disallows: path traversal (../, ./), shell metacharacters, and consecutive dots
 */
function parsePlugins(plugins?: string): string[] {
  const trimmedPlugins = plugins?.trim();

  if (!trimmedPlugins) {
    return [];
  }

  // Split by comma and process each plugin
  return trimmedPlugins
    .split(",")
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
 */
async function installPlugin(
  pluginName: string,
  claudeExecutable: string,
): Promise<void> {
  return executeClaudeCommand(
    claudeExecutable,
    ["plugin", "install", pluginName],
    `Failed to install plugin '${pluginName}'`,
  );
}

/**
 * Adds a Claude Code plugin marketplace
 * @param claudeExecutable - Path to the Claude executable
 * @param marketplaceUrl - The marketplace Git URL to add
 * @returns Promise that resolves when the marketplace add command completes
 * @throws {Error} If the command fails to execute
 */
async function addMarketplace(
  claudeExecutable: string,
  marketplaceUrl: string,
): Promise<void> {
  console.log(`Adding marketplace: ${marketplaceUrl}`);

  return executeClaudeCommand(
    claudeExecutable,
    ["plugin", "marketplace", "add", marketplaceUrl],
    `Failed to add marketplace '${marketplaceUrl}'`,
  );
}

/**
 * Installs Claude Code plugins from a comma-separated list
 * @param pluginsInput - Comma-separated list of plugin names, or undefined/empty to skip installation
 * @param claudeExecutable - Path to the Claude executable (defaults to "claude")
 * @param marketplacesInput - Newline-separated list of marketplace Git URLs
 * @returns Promise that resolves when all plugins are installed
 * @throws {Error} If any plugin fails validation or installation (stops on first error)
 */
export async function installPlugins(
  pluginsInput: string | undefined,
  claudeExecutable?: string,
  marketplacesInput?: string,
): Promise<void> {
  const plugins = parsePlugins(pluginsInput);

  if (plugins.length === 0) {
    console.log("No plugins to install");
    return;
  }

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

  console.log(`Installing ${plugins.length} plugin(s)...`);

  for (const plugin of plugins) {
    console.log(`Installing plugin: ${plugin}`);
    await installPlugin(plugin, resolvedExecutable);
    console.log(`✓ Successfully installed: ${plugin}`);
  }

  console.log("All plugins installed successfully");
}
