import * as core from "@actions/core";
import * as installer from "./installer.js";
import * as cacheManager from "./cache.js";
import * as plugins from "./plugins.js";

async function run(): Promise<void> {
  try {
    // Get inputs
    const version = core.getInput("version") || "stable";
    const githubToken = core.getInput("github_token") || "";
    const marketplaces = core.getInput("marketplaces") || "";
    const pluginsInput = core.getInput("plugins") || "";

    core.info(`Setting up Claude Code version: ${version}`);

    // Try to restore from cache
    const cacheHit = await cacheManager.restoreCache(version);
    core.setOutput("cache-hit", cacheHit);

    let installedVersion: string;
    let claudePath: string;

    if (cacheHit) {
      core.info("Claude Code restored from cache");

      // Verify installation
      const cachedVersion = await installer.getInstalledVersion();
      if (!cachedVersion) {
        throw new Error(
          "Cache restoration succeeded but Claude Code is not functional",
        );
      }

      installedVersion = cachedVersion;
      claudePath = installer.getClaudePath();

      // Add to PATH
      const installDir = claudePath.substring(0, claudePath.lastIndexOf("/"));
      core.addPath(installDir);
    } else {
      // Install Claude Code
      const result = await installer.install({ version });
      installedVersion = result.version;
      claudePath = result.claudePath;

      // Save to cache for future runs
      await cacheManager.saveCache(version);
    }

    // Set outputs
    core.setOutput("version", installedVersion);
    core.setOutput("claude-path", claudePath);

    // Add marketplaces if provided
    let marketplacesAdded = 0;
    if (marketplaces) {
      marketplacesAdded = await plugins.addMarketplaces(
        marketplaces,
        githubToken,
      );
    }
    core.setOutput("marketplaces_added", marketplacesAdded);

    // Install plugins if provided
    let pluginsInstalled: string[] = [];
    if (pluginsInput) {
      pluginsInstalled = await plugins.installPlugins(pluginsInput);
    }
    core.setOutput("plugins_installed", pluginsInstalled.join(","));

    core.info("✓ Claude Code setup completed successfully");
    core.info(`  Version: ${installedVersion}`);
    core.info(`  Path: ${claudePath}`);
    core.info(`  Marketplaces added: ${marketplacesAdded}`);
    core.info(`  Plugins installed: ${pluginsInstalled.length}`);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed(String(error));
    }
  }
}

run();
