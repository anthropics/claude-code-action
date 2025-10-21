#!/usr/bin/env bun

import { spawn } from "child_process";

// Declare console as global for TypeScript
declare const console: {
  log: (message: string) => void;
  error: (message: string) => void;
};

/**
 * Parses a comma-separated list of plugin names and returns an array of trimmed plugin names
 */
export function parsePlugins(pluginsInput: string | undefined): string[] {
  if (!pluginsInput || pluginsInput.trim() === "") {
    return [];
  }

  return pluginsInput
    .split(",")
    .map((plugin) => plugin.trim())
    .filter((plugin) => plugin.length > 0);
}

/**
 * Installs a single Claude Code plugin
 */
export async function installPlugin(
  pluginName: string,
  claudeExecutable: string = "claude",
): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(claudeExecutable, ["plugin", "install", pluginName], {
      stdio: "inherit",
    });

    process.on("close", (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Failed to install plugin '${pluginName}' (exit code: ${code})`,
          ),
        );
      }
    });

    process.on("error", (err: Error) => {
      reject(
        new Error(`Failed to install plugin '${pluginName}': ${err.message}`),
      );
    });
  });
}

/**
 * Installs Claude Code plugins from a comma-separated list
 */
export async function installPlugins(
  pluginsInput: string | undefined,
  claudeExecutable: string = "claude",
): Promise<void> {
  const plugins = parsePlugins(pluginsInput);

  if (plugins.length === 0) {
    console.log("No plugins to install");
    return;
  }

  console.log(`Installing ${plugins.length} plugin(s)...`);

  for (const plugin of plugins) {
    console.log(`Installing plugin: ${plugin}`);
    await installPlugin(plugin, claudeExecutable);
    console.log(`✓ Successfully installed: ${plugin}`);
  }

  console.log("All plugins installed successfully");
}
