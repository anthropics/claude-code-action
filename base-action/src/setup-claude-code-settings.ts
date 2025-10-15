import * as core from "@actions/core";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export async function setupClaudeCodeSettings(
  settings?: string,
  homeDir?: string,
) {
  const home = homeDir || homedir();
  const claudeDir = join(home, ".claude");
  const settingsPath = join(claudeDir, "settings.json");

  // Create .claude directory if it doesn't exist
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }

  let finalSettings: any = {
    enableAllProjectMcpServers: true,
  };

  // Load existing settings if they exist
  if (existsSync(settingsPath)) {
    try {
      const existing = JSON.parse(readFileSync(settingsPath, "utf-8"));
      finalSettings = { ...existing, ...finalSettings };
    } catch (error) {
      console.log("Failed to parse existing settings, using defaults");
    }
  }

  // Process input settings if provided
  if (settings) {
    try {
      // Try parsing as JSON first
      const inputSettings = JSON.parse(settings);
      finalSettings = { ...finalSettings, ...inputSettings };
    } catch {
      // If not JSON, treat as file path
      try {
        if (existsSync(settings)) {
          const fileSettings = JSON.parse(readFileSync(settings, "utf-8"));
          finalSettings = { ...finalSettings, ...fileSettings };
        }
      } catch (error) {
        console.log(`Failed to read settings file: ${error}`);
      }
    }
  }

  // Write settings file
  writeFileSync(settingsPath, JSON.stringify(finalSettings, null, 2));
}
