import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as io from "@actions/io";
import * as path from "path";
import * as os from "os";
import { promises as fs } from "fs";

export interface InstallOptions {
  version: string;
}

export interface InstallResult {
  version: string;
  claudePath: string;
}

/**
 * Get the installation directory for Claude Code
 */
function getInstallDir(): string {
  return path.join(os.homedir(), ".local", "bin");
}

/**
 * Get the Claude Code executable path
 */
export function getClaudePath(): string {
  return path.join(getInstallDir(), "claude");
}

/**
 * Check if Claude Code is already installed
 */
export async function isInstalled(): Promise<boolean> {
  try {
    const claudePath = getClaudePath();
    await fs.access(claudePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the installed Claude Code version
 */
export async function getInstalledVersion(): Promise<string | null> {
  if (!(await isInstalled())) {
    return null;
  }

  try {
    const claudePath = getClaudePath();
    let output = "";

    await exec.exec(claudePath, ["--version"], {
      silent: true,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
      },
    });

    // Parse version from output (e.g., "claude 2.0.1")
    const match = output.match(/claude\s+(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch (error) {
    core.warning(`Failed to get Claude Code version: ${error}`);
    return null;
  }
}

/**
 * Install Claude Code
 */
export async function install(options: InstallOptions): Promise<InstallResult> {
  const { version } = options;

  core.info(`Installing Claude Code version: ${version}`);

  // Ensure installation directory exists
  const installDir = getInstallDir();
  await io.mkdirP(installDir);

  // Download and run the installation script
  const installScript = "curl -fsSL https://claude.ai/install.sh";
  const installCommand =
    version === "stable" || version === "latest"
      ? `${installScript} | bash -s ${version}`
      : `${installScript} | bash -s ${version}`;

  await exec.exec("bash", ["-c", installCommand]);

  // Verify installation
  const claudePath = getClaudePath();
  try {
    await fs.access(claudePath);
  } catch {
    throw new Error("Claude Code installation failed: executable not found");
  }

  // Get installed version
  const installedVersion = await getInstalledVersion();
  if (!installedVersion) {
    throw new Error("Failed to verify Claude Code installation");
  }

  core.info(`Successfully installed Claude Code ${installedVersion}`);

  // Add to PATH
  core.addPath(installDir);

  return {
    version: installedVersion,
    claudePath,
  };
}
