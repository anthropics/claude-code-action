#!/usr/bin/env bun

import { exec } from "child_process";
import { promisify } from "util";
import { mkdir, stat, rm } from "fs/promises";
import { join } from "path";
import logger from "./logger";
import type { 
  WorkspaceSetupConfig, 
  WorkspaceInfo, 
  GitRepository
} from "./types";
import { WorkspaceError } from "./types";

const execAsync = promisify(exec);

export class WorkspaceManager {
  private config: WorkspaceSetupConfig;
  private workspaceInfo?: WorkspaceInfo;

  constructor(config: WorkspaceSetupConfig) {
    this.config = config;
  }

  /**
   * Setup workspace by cloning repository
   */
  async setupWorkspace(repositoryUrl: string, username: string, sessionKey?: string): Promise<WorkspaceInfo> {
    try {
      // Use thread-specific directory instead of user-specific to avoid conflicts
      // between concurrent threads from the same user
      const threadId = process.env.SLACK_THREAD_TS || process.env.SLACK_RESPONSE_TS || sessionKey || username;
      logger.info(`Setting up thread-specific workspace for ${username}, thread: ${threadId}...`);
      const userDirectory = join(this.config.baseDirectory, threadId.replace(/[^a-zA-Z0-9.-]/g, '_'));
      
      // Ensure base directory exists
      await this.ensureDirectory(this.config.baseDirectory);
      
      // Check if user directory already exists
      const userDirExists = await this.directoryExists(userDirectory);
      
      if (userDirExists) {
        logger.info(`User directory ${userDirectory} already exists, checking if it's a git repository...`);
        
        // Check if it's a git repository
        const isGitRepo = await this.isGitRepository(userDirectory);
        
        if (isGitRepo) {
          logger.info("Existing git repository found, updating...");
          await this.updateRepository(userDirectory, sessionKey);
        } else {
          logger.info("Directory exists but is not a git repository, removing and re-cloning...");
          await rm(userDirectory, { recursive: true, force: true });
          await this.cloneRepository(repositoryUrl, userDirectory);
        }
      } else {
        logger.info("User directory does not exist, cloning repository...");
        await this.cloneRepository(repositoryUrl, userDirectory);
      }

      // Setup git configuration
      await this.setupGitConfig(userDirectory, username);
      
      // Get repository info
      const repository = await this.getRepositoryInfo(userDirectory, repositoryUrl);
      
      // Create workspace info
      this.workspaceInfo = {
        baseDirectory: this.config.baseDirectory,
        userDirectory,
        repository,
        setupComplete: true,
      };

      logger.info(`Thread-specific workspace setup completed for ${username} (thread: ${threadId}) at ${userDirectory}`);
      return this.workspaceInfo;

    } catch (error) {
      throw new WorkspaceError(
        "setupWorkspace",
        `Failed to setup workspace for ${username}`,
        error as Error
      );
    }
  }

  /**
   * Clone repository to specified directory
   */
  private async cloneRepository(repositoryUrl: string, targetDirectory: string): Promise<void> {
    try {
      logger.info(`Cloning repository ${repositoryUrl} to ${targetDirectory}...`);
      
      // Use GitHub token for authentication
      const authenticatedUrl = this.addGitHubAuth(repositoryUrl);
      
      const { stderr } = await execAsync(
        `git clone "${authenticatedUrl}" "${targetDirectory}"`,
        { timeout: 180000 } // 3 minute timeout for slow repositories
      );
      
      if (stderr && !stderr.includes("Cloning into")) {
        logger.warn("Git clone warnings:", stderr);
      }
      
      logger.info("Repository cloned successfully");
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout = errorMessage.includes('killed') && errorMessage.includes('SIGTERM');
      const is404 = errorMessage.includes('Repository not found') || errorMessage.includes('not found');
      
      let userFriendlyMessage = `Failed to clone repository ${repositoryUrl}.`;
      if (isTimeout) {
        userFriendlyMessage += ' The repository took too long to clone (timeout after 3 minutes). This could indicate a very large repository or network issues.';
      } else if (is404) {
        userFriendlyMessage += ' The repository does not exist or you do not have access to it.';
      } else {
        userFriendlyMessage += ` Error: ${errorMessage}`;
      }
      
      throw new WorkspaceError(
        "cloneRepository",
        userFriendlyMessage,
        error as Error
      );
    }
  }

  /**
   * Update existing repository
   */
  private async updateRepository(repositoryDirectory: string, sessionKey?: string): Promise<void> {
    try {
      logger.info(`Updating repository at ${repositoryDirectory}...`);
      
      // Fetch latest changes
      await execAsync("git fetch origin", { 
        cwd: repositoryDirectory,
        timeout: 30000 
      });
      
      // If sessionKey provided, check if session branch exists
      if (sessionKey) {
        // Use the thread timestamp directly in the branch name
        const branchName = `claude/${sessionKey.replace(/\./g, "-")}`;
        
        try {
          // Check if the branch exists on remote
          const { stdout } = await execAsync(
            `git ls-remote --heads origin ${branchName}`,
            { cwd: repositoryDirectory, timeout: 10000 }
          );
          
          if (stdout.trim()) {
            logger.info(`Session branch ${branchName} exists on remote, checking it out...`);
            
            // Branch exists on remote, check it out
            try {
              // Try to checkout existing local branch
              await execAsync(`git checkout "${branchName}"`, {
                cwd: repositoryDirectory,
                timeout: 10000
              });
              // Pull latest changes
              await execAsync(`git pull origin "${branchName}"`, {
                cwd: repositoryDirectory,
                timeout: 30000
              });
            } catch (checkoutError) {
              // Local branch doesn't exist, create it from remote
              await execAsync(`git checkout -b "${branchName}" "origin/${branchName}"`, {
                cwd: repositoryDirectory,
                timeout: 10000
              });
            }
            
            logger.info(`Successfully checked out session branch ${branchName}`);
            return;
          }
        } catch (error) {
          logger.info(`Session branch not found on remote, will use main/master`);
        }
      }
      
      // No session branch or sessionKey not provided, reset to main/master
      try {
        await execAsync("git reset --hard origin/main", { 
          cwd: repositoryDirectory,
          timeout: 10000 
        });
      } catch (error) {
        // Try master if main doesn't exist
        await execAsync("git reset --hard origin/master", { 
          cwd: repositoryDirectory,
          timeout: 10000 
        });
      }
      
      logger.info("Repository updated successfully");
      
    } catch (error) {
      throw new WorkspaceError(
        "updateRepository",
        `Failed to update repository at ${repositoryDirectory}`,
        error as Error
      );
    }
  }

  /**
   * Setup git configuration for the user
   */
  private async setupGitConfig(repositoryDirectory: string, username: string): Promise<void> {
    try {
      logger.info(`Setting up git configuration for ${username}...`);
      
      // Set user name and email
      await execAsync(`git config user.name "Peerbot"`, {
        cwd: repositoryDirectory,
      });
      
      await execAsync(`git config user.email "claude-code-bot+${username}@noreply.github.com"`, {
        cwd: repositoryDirectory,
      });
      
      // Set push default
      await execAsync("git config push.default simple", {
        cwd: repositoryDirectory,
      });
      
      logger.info("Git configuration completed");
      
    } catch (error) {
      throw new WorkspaceError(
        "setupGitConfig",
        `Failed to setup git configuration for ${username}`,
        error as Error
      );
    }
  }


  /**
   * Get repository information
   */
  private async getRepositoryInfo(repositoryDirectory: string, repositoryUrl: string): Promise<GitRepository> {
    try {
      // Get current branch
      const { stdout: branchOutput } = await execAsync("git branch --show-current", {
        cwd: repositoryDirectory,
      });
      const branch = branchOutput.trim();
      
      // Get last commit hash
      const { stdout: commitOutput } = await execAsync("git rev-parse HEAD", {
        cwd: repositoryDirectory,
      });
      const lastCommit = commitOutput.trim();
      
      return {
        url: repositoryUrl,
        branch,
        directory: repositoryDirectory,
        lastCommit,
      };
      
    } catch (error) {
      throw new WorkspaceError(
        "getRepositoryInfo",
        `Failed to get repository information`,
        error as Error
      );
    }
  }

  /**
   * Add GitHub authentication to URL
   */
  private addGitHubAuth(repositoryUrl: string): string {
    try {
      const url = new URL(repositoryUrl);
      
      if (url.hostname === "github.com") {
        // Convert to authenticated HTTPS URL
        url.username = "x-access-token";
        url.password = this.config.githubToken;
        return url.toString();
      }
      
      return repositoryUrl;
      
    } catch (error) {
      logger.warn("Failed to parse repository URL, using as-is:", error);
      return repositoryUrl;
    }
  }

  /**
   * Check if directory exists
   */
  private async directoryExists(path: string): Promise<boolean> {
    try {
      const stats = await stat(path);
      return stats.isDirectory();
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if directory is a git repository
   */
  private async isGitRepository(path: string): Promise<boolean> {
    try {
      await execAsync("git status", { cwd: path, timeout: 5000 });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Ensure directory exists
   */
  private async ensureDirectory(path: string): Promise<void> {
    try {
      await mkdir(path, { recursive: true });
    } catch (error: any) {
      if (error.code !== "EEXIST") {
        throw error;
      }
    }
  }

  /**
   * Get workspace information
   */
  getWorkspaceInfo(): WorkspaceInfo | undefined {
    return this.workspaceInfo;
  }

  /**
   * Get current working directory
   */
  getCurrentWorkingDirectory(): string {
    return this.workspaceInfo?.userDirectory || this.config.baseDirectory;
  }

  /**
   * Create a new branch for the session
   */
  async createSessionBranch(sessionKey: string): Promise<string> {
    if (!this.workspaceInfo) {
      throw new WorkspaceError("createSessionBranch", "Workspace not setup");
    }

    try {
      // Use the thread timestamp directly in the branch name
      // Replace dots with dashes for git branch naming conventions
      const branchName = `claude/${sessionKey.replace(/\./g, "-")}`;
      
      logger.info(`Checking if session branch exists: ${branchName}`);
      
      // Check if branch already exists locally or remotely
      try {
        // Try to checkout existing branch
        await execAsync(`git checkout "${branchName}"`, {
          cwd: this.workspaceInfo.userDirectory,
        });
        logger.info(`Session branch ${branchName} already exists locally, checked out`);
        
        // Pull latest changes from remote to preserve previous work
        try {
          await execAsync(`git pull origin "${branchName}"`, {
            cwd: this.workspaceInfo.userDirectory,
            timeout: 30000
          });
          logger.info(`Pulled latest changes for session branch ${branchName}`);
        } catch (pullError) {
          // If pull fails, branch might not exist on remote yet - that's okay for new branches
          logger.warn(`Failed to pull latest changes for ${branchName} (branch might be new):`, pullError);
        }
      } catch (checkoutError) {
        // Branch doesn't exist locally, check remote
        try {
          const { stdout } = await execAsync(
            `git ls-remote --heads origin ${branchName}`,
            { cwd: this.workspaceInfo.userDirectory, timeout: 10000 }
          );
          
          if (stdout.trim()) {
            // Branch exists on remote, checkout from remote
            await execAsync(`git checkout -b "${branchName}" "origin/${branchName}"`, {
              cwd: this.workspaceInfo.userDirectory,
            });
            logger.info(`Session branch ${branchName} exists on remote, checked out with latest changes`);
          } else {
            // Branch doesn't exist anywhere, create new
            await execAsync(`git checkout -b "${branchName}"`, {
              cwd: this.workspaceInfo.userDirectory,
            });
            logger.info(`Created new session branch: ${branchName}`);
            
            // Push the new branch to GitHub immediately to ensure it exists
            try {
              await execAsync(`git push -u origin "${branchName}"`, {
                cwd: this.workspaceInfo.userDirectory,
                timeout: 120000
              });
              logger.info(`Pushed new session branch to GitHub: ${branchName}`);
            } catch (pushError) {
              logger.warn(`Failed to push new branch to GitHub:`, pushError);
            }
          }
        } catch (error) {
          // Error checking remote, create new branch
          await execAsync(`git checkout -b "${branchName}"`, {
            cwd: this.workspaceInfo.userDirectory,
          });
          logger.info(`Created new session branch: ${branchName}`);
          
          // Push the new branch to GitHub immediately to ensure it exists
          try {
            await execAsync(`git push -u origin "${branchName}"`, {
              cwd: this.workspaceInfo.userDirectory,
              timeout: 120000
            });
            logger.info(`Pushed new session branch to GitHub: ${branchName}`);
          } catch (pushError) {
            logger.warn(`Failed to push new branch to GitHub:`, pushError);
          }
        }
      }
      
      this.workspaceInfo.repository.branch = branchName;
      
      return branchName;
      
    } catch (error) {
      throw new WorkspaceError(
        "createSessionBranch",
        `Failed to create session branch for ${sessionKey}`,
        error as Error
      );
    }
  }

  /**
   * Commit and push changes
   */
  async commitAndPush(message: string): Promise<void> {
    if (!this.workspaceInfo) {
      throw new WorkspaceError("commitAndPush", "Workspace not setup");
    }

    try {
      const repoDir = this.workspaceInfo.userDirectory;
      
      
      // Add all changes
      await execAsync("git add .", { cwd: repoDir });
      
      // Check if there are changes to commit
      let hasUnstagedChanges = false;
      try {
        await execAsync("git diff --cached --exit-code", { cwd: repoDir });
        logger.info("No staged changes to commit - checking for unpushed commits");
      } catch (error) {
        // Staged changes exist, proceed with commit
        hasUnstagedChanges = true;
      }
      
      // Check if there are unpushed commits
      let hasUnpushedCommits = false;
      try {
        const branch = this.workspaceInfo.repository.branch;
        await execAsync(`git diff --exit-code origin/${branch}..HEAD`, { cwd: repoDir });
        logger.info("No unpushed commits");
      } catch (error) {
        // Unpushed commits exist
        hasUnpushedCommits = true;
        logger.info("Found unpushed commits");
      }
      
      // If neither staged changes nor unpushed commits, return
      if (!hasUnstagedChanges && !hasUnpushedCommits) {
        logger.info("No changes to commit or push");
        return;
      }
      
      // Commit changes if there are staged changes
      if (hasUnstagedChanges) {
        await execAsync(`git commit -m "${message}"`, { cwd: repoDir });
        logger.info("Changes committed");
      }
      
      // Always push if there are unpushed commits (either new ones or existing ones)
      if (hasUnpushedCommits || hasUnstagedChanges) {
        const branch = this.workspaceInfo.repository.branch;
        await execAsync(`git push -u origin "${branch}"`, { 
          cwd: repoDir,
          timeout: 120000 
        });
        logger.info(`Changes pushed to ${branch}`);
      }
      
    } catch (error) {
      throw new WorkspaceError(
        "commitAndPush",
        `Failed to commit and push changes`,
        error as Error
      );
    }
  }

  /**
   * Clean up workspace
   */
  async cleanup(): Promise<void> {
    try {
      logger.info("Cleaning up workspace...");
      
      if (this.workspaceInfo) {
        // Commit any final changes
        try {
          await this.commitAndPush("Final session cleanup by Claude Code Worker");
        } catch (error) {
          logger.warn("Failed to commit final changes:", error);
        }
      }
      
      logger.info("Workspace cleanup completed");
      
    } catch (error) {
      logger.error("Error during workspace cleanup:", error);
    }
  }

  /**
   * Get repository status
   */
  async getRepositoryStatus(): Promise<{
    branch: string;
    hasChanges: boolean;
    changedFiles: string[];
  }> {
    if (!this.workspaceInfo) {
      throw new WorkspaceError("getRepositoryStatus", "Workspace not setup");
    }

    try {
      const repoDir = this.workspaceInfo.userDirectory;
      
      // Get current branch
      const { stdout: branchOutput } = await execAsync("git branch --show-current", {
        cwd: repoDir,
      });
      const branch = branchOutput.trim();
      
      // Get status
      const { stdout: statusOutput } = await execAsync("git status --porcelain", {
        cwd: repoDir,
      });
      
      const changedFiles = statusOutput
        .split("\n")
        .filter(line => line.trim())
        .map(line => line.substring(3)); // Remove status prefix
      
      return {
        branch,
        hasChanges: changedFiles.length > 0,
        changedFiles,
      };
      
    } catch (error) {
      throw new WorkspaceError(
        "getRepositoryStatus",
        "Failed to get repository status",
        error as Error
      );
    }
  }
}