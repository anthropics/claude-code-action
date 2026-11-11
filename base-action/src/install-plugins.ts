import { spawn, ChildProcess } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const PLUGIN_NAME_REGEX = /^[@a-zA-Z0-9_\-\/\.]+$/;
const MAX_PLUGIN_NAME_LENGTH = 512;
const PATH_TRAVERSAL_REGEX =
  /\.\.\/|\/\.\.|\.\/|\/\.|(?:^|\/)\.\.$|(?:^|\/)\.$|\.\.(?![0-9])/;
const MARKETPLACE_URL_REGEX =
  /^https:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+\.git$/;
// Git ref (branch, tag, or commit SHA) allowed after `.git#`.
// Must start with an alphanumeric so a ref can never be mistaken for a
// command-line flag, and `..` is rejected below to keep rev-parse tricks out.
const MARKETPLACE_REF_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._\/-]*$/;
const MAX_REF_LENGTH = 256;

type MarketplaceEntry = {
  /** Git URL or local path, without any `#ref` suffix */
  source: string;
  /** Optional branch, tag, or commit SHA to pin the marketplace to */
  ref?: string;
};

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
 * Parses and validates a marketplace URL or local path, with an optional
 * `#<ref>` pin after the `.git` suffix (e.g. `https://.../repo.git#v1.2.3`).
 * The ref may be a branch, tag, or commit SHA.
 * @param input - The marketplace URL or local path to parse
 * @returns The validated marketplace entry
 * @throws {Error} If the input is invalid
 */
function parseMarketplaceInput(input: string): MarketplaceEntry {
  const normalized = input.trim();

  if (!normalized) {
    throw new Error("Marketplace URL or path cannot be empty");
  }

  // Local paths are passed directly to Claude Code which handles them
  if (isLocalPath(normalized)) {
    return { source: normalized };
  }

  // Split an optional `#<ref>` pin off the URL. `.git#` is unambiguous as a
  // separator because valid marketplace URLs always end in `.git`.
  let source = normalized;
  let ref: string | undefined;
  const pinIndex = normalized.lastIndexOf(".git#");
  if (pinIndex !== -1) {
    source = normalized.slice(0, pinIndex + ".git".length);
    ref = normalized.slice(pinIndex + ".git#".length);

    if (
      !ref ||
      ref.length > MAX_REF_LENGTH ||
      !MARKETPLACE_REF_REGEX.test(ref) ||
      ref.includes("..")
    ) {
      throw new Error(`Invalid marketplace ref in: ${input}`);
    }
  }

  // Validate as URL
  if (!MARKETPLACE_URL_REGEX.test(source)) {
    throw new Error(`Invalid marketplace URL format: ${input}`);
  }

  // Additional check for valid URL structure
  try {
    new URL(source);
  } catch {
    throw new Error(`Invalid marketplace URL: ${input}`);
  }

  return { source, ref };
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
 * @param marketplaces - Newline-separated list of marketplace Git URLs (optionally `#ref`-pinned) or local paths
 * @returns Array of validated marketplace entries (empty array if none provided)
 */
function parseMarketplaces(marketplaces?: string): MarketplaceEntry[] {
  const trimmed = marketplaces?.trim();

  if (!trimmed) {
    return [];
  }

  // Split by newline and process each entry
  return trimmed
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => parseMarketplaceInput(entry));
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
 * Executes a command with proper error handling
 * @param executable - Path to the executable
 * @param args - Command arguments to pass to the executable
 * @param errorContext - Context string for error messages (e.g., "Failed to install plugin 'foo'")
 * @returns Promise that resolves when the command completes successfully
 * @throws {Error} If the command fails to execute
 */
async function executeCommand(
  executable: string,
  args: string[],
  errorContext: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const childProcess: ChildProcess = spawn(executable, args, {
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

  return executeCommand(
    claudeExecutable,
    ["plugin", "install", pluginName],
    `Failed to install plugin '${pluginName}'`,
  );
}

/**
 * Clones a marketplace repository at a specific ref into a temp directory.
 *
 * Uses init + fetch-by-ref + checkout FETCH_HEAD rather than
 * `git clone --branch` because `--branch` accepts only branch and tag names —
 * this path handles branches, tags, AND commit SHAs uniformly (GitHub permits
 * fetching unadvertised commits by SHA).
 * @param source - The marketplace Git URL
 * @param ref - Branch, tag, or commit SHA to check out
 * @returns The path of the checked-out marketplace
 * @throws {Error} If any git step fails
 */
async function cloneMarketplaceAtRef(
  source: string,
  ref: string,
): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "claude-marketplace-"));
  const context = `Failed to fetch marketplace '${source}' at ref '${ref}'`;

  await executeCommand("git", ["init", "--quiet", dir], context);
  await executeCommand(
    "git",
    ["-C", dir, "remote", "add", "origin", source],
    context,
  );
  await executeCommand(
    "git",
    ["-C", dir, "fetch", "--quiet", "--depth", "1", "origin", ref],
    context,
  );
  await executeCommand(
    "git",
    ["-C", dir, "checkout", "--quiet", "FETCH_HEAD"],
    context,
  );

  return dir;
}

/**
 * Adds a Claude Code plugin marketplace, honoring an optional ref pin
 * @param claudeExecutable - Path to the Claude executable
 * @param marketplace - The marketplace entry (Git URL or local path, optional ref)
 * @returns Promise that resolves when the marketplace add command completes
 * @throws {Error} If the command fails to execute
 */
async function addMarketplace(
  claudeExecutable: string,
  marketplace: MarketplaceEntry,
): Promise<void> {
  let target = marketplace.source;

  if (marketplace.ref) {
    console.log(
      `Adding marketplace: ${marketplace.source} (pinned to ${marketplace.ref})`,
    );
    target = await cloneMarketplaceAtRef(marketplace.source, marketplace.ref);
  } else {
    console.log(`Adding marketplace: ${marketplace.source}`);
  }

  return executeCommand(
    claudeExecutable,
    ["plugin", "marketplace", "add", target],
    `Failed to add marketplace '${marketplace.source}'`,
  );
}

/**
 * Installs Claude Code plugins from a newline-separated list
 * @param marketplacesInput - Newline-separated list of marketplace Git URLs (each optionally pinned with `#<branch|tag|sha>`) or local paths
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
      console.log(`✓ Successfully added marketplace: ${marketplace.source}`);
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
