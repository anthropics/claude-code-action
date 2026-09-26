import * as core from "@actions/core";
import * as cache from "@actions/cache";
import * as path from "path";
import * as os from "os";

/**
 * Get the cache key for Claude Code
 */
export function getCacheKey(version: string): string {
  const platform = os.platform();
  const arch = os.arch();

  // For "latest" version, include date to rotate cache daily
  // For specific versions, cache permanently
  if (version === "latest") {
    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    return `claude-code-v2-${platform}-${arch}-latest-${date}`;
  }

  return `claude-code-v2-${platform}-${arch}-${version}`;
}

/**
 * Get the cache paths for Claude Code
 */
export function getCachePaths(): string[] {
  const homeDir = os.homedir();
  return [
    path.join(homeDir, ".local", "bin", "claude"),
    path.join(homeDir, ".claude"),
  ];
}

/**
 * Restore Claude Code from cache
 */
export async function restoreCache(version: string): Promise<boolean> {
  const paths = getCachePaths();
  const primaryKey = getCacheKey(version);

  core.info(`Attempting to restore cache with key: ${primaryKey}`);

  try {
    const cacheKey = await cache.restoreCache(paths, primaryKey);

    if (cacheKey) {
      core.info(`Cache restored successfully from key: ${cacheKey}`);
      return true;
    } else {
      core.info("Cache not found");
      return false;
    }
  } catch (error) {
    core.warning(`Cache restoration failed: ${error}`);
    return false;
  }
}

/**
 * Save Claude Code to cache
 */
export async function saveCache(version: string): Promise<void> {
  const paths = getCachePaths();
  const primaryKey = getCacheKey(version);

  core.info(`Saving cache with key: ${primaryKey}`);

  try {
    await cache.saveCache(paths, primaryKey);
    core.info("Cache saved successfully");
  } catch (error) {
    // Don't fail the action if cache saving fails
    core.warning(`Failed to save cache: ${error}`);
  }
}
