#!/usr/bin/env bun

import { Octokit } from "@octokit/rest";
import logger from "../logger";
import type { 
  GitHubConfig,
  UserRepository
} from "../types";

// Define custom error class
class GitHubRepositoryError extends Error {
  constructor(
    public operation: string,
    public username: string,
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'GitHubRepositoryError';
  }
}

export class GitHubRepositoryManager {
  private octokit: Octokit;
  private config: GitHubConfig;
  private repositories = new Map<string, UserRepository>(); // username -> repository info

  constructor(config: GitHubConfig) {
    this.config = config;
    
    this.octokit = new Octokit({
      auth: config.token,
    });
  }

  /**
   * Extract repository name from GitHub URL
   */
  private extractRepoNameFromUrl(url: string): string {
    try {
      // Handle both HTTPS and SSH URLs
      const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
      if (match && match[2]) {
        return match[2]; // Return repository name
      }
      return 'unknown-repo';
    } catch (error) {
      return 'unknown-repo';
    }
  }

  /**
   * Ensure user repository exists, create if needed
   */
  async ensureUserRepository(username: string): Promise<UserRepository> {
    try {
      // If a repository override is configured, use it instead of creating user-specific repositories
      if (this.config.repository) {
        // Create repository info from override URL (no caching for overrides)
        const repository: UserRepository = {
          username,
          repositoryName: this.extractRepoNameFromUrl(this.config.repository),
          repositoryUrl: this.config.repository,
          cloneUrl: this.config.repository.replace('github.com', 'github.com'),
          createdAt: Date.now(),
          lastUsed: Date.now(),
        };

        logger.info(`Using repository override for user ${username}: ${repository.repositoryUrl}`);
        return repository;
      }

      // Check if we have cached repository info
      const cached = this.repositories.get(username);
      if (cached) {
        // Update last used timestamp
        cached.lastUsed = Date.now();
        return cached;
      }

      const repositoryName = username; // Repository name matches username
      
      // Check if repository exists
      let repository: UserRepository | undefined;
      
      // Determine the owner(s) to check
      const possibleOwners: string[] = [];
      
      if (this.config.organization && this.config.organization.trim() !== "") {
        // If organization is specified, check there first
        possibleOwners.push(this.config.organization);
      }
      
      // Always add authenticated user as fallback
      try {
        const authUser = await this.octokit.rest.users.getAuthenticated();
        if (!possibleOwners.includes(authUser.data.login)) {
          possibleOwners.push(authUser.data.login);
        }
      } catch (e) {
        logger.warn('Could not get authenticated user:', e);
      }

      let foundRepo = false;
      for (const owner of possibleOwners) {
        try {
          const repoResponse = await this.octokit.rest.repos.get({
            owner: owner,
            repo: repositoryName,
          });
          
          // Repository exists, create repository info
          repository = {
            username,
            repositoryName,
            repositoryUrl: repoResponse.data.html_url,
            cloneUrl: repoResponse.data.clone_url,
            createdAt: new Date(repoResponse.data.created_at).getTime(),
            lastUsed: Date.now(),
          };
          
          logger.info(`Found existing repository for user ${username} under ${owner}: ${repository.repositoryUrl}`);
          foundRepo = true;
          break;
          
        } catch (error: any) {
          if (error.status !== 404) {
            throw error;
          }
          // Continue to next owner
        }
      }
      
      if (!foundRepo) {
        // Repository doesn't exist anywhere, create it
        repository = await this.createUserRepository(username);
      }

      // Cache repository info
      if (repository) {
        this.repositories.set(username, repository);
        return repository;
      } else {
        throw new Error(`Failed to find or create repository for user ${username}`);
      }

    } catch (error) {
      throw new GitHubRepositoryError(
        "ensureUserRepository",
        username,
        `Failed to ensure repository for user ${username}`,
        error as Error
      );
    }
  }

  /**
   * Create a new user repository
   */
  private async createUserRepository(username: string): Promise<UserRepository> {
    try {
      const repositoryName = username;
      
      logger.info(`Creating repository for user ${username}...`);
      
      // Try to create repository in organization first, fallback to authenticated user
      let repoResponse;
      
      if (this.config.organization && this.config.organization.trim() !== "") {
        try {
          // Try to create in organization first
          repoResponse = await this.octokit.rest.repos.createInOrg({
            org: this.config.organization,
            name: repositoryName,
            description: `Personal workspace for ${username} - Peerbot`,
            private: false,
            has_issues: true,
            has_projects: false,
            has_wiki: false,
            auto_init: true,
            gitignore_template: "Node",
            license_template: "mit",
          });
          logger.info(`Created repository for user ${username} in organization ${this.config.organization}`);
        } catch (orgError: any) {
          if (orgError.status === 404) {
            logger.info(`Organization ${this.config.organization} not found, creating repository for authenticated user...`);
            repoResponse = await this.octokit.rest.repos.createForAuthenticatedUser({
              name: repositoryName,
              description: `Personal workspace for ${username} - Peerbot`,
              private: false,
              has_issues: true,
              has_projects: false,
              has_wiki: false,
              auto_init: true,
              gitignore_template: "Node",
              license_template: "mit",
            });
          } else {
            throw orgError;
          }
        }
      } else {
        // No organization specified, create for authenticated user
        logger.info(`No organization specified, creating repository for authenticated user...`);
        repoResponse = await this.octokit.rest.repos.createForAuthenticatedUser({
          name: repositoryName,
          description: `Personal workspace for ${username} - Peerbot`,
          private: false,
          has_issues: true,
          has_projects: false,
          has_wiki: false,
          auto_init: true,
          gitignore_template: "Node",
          license_template: "mit",
        });
      }

      
      // Use the actual owner from the response
      const owner = repoResponse.data.owner.login;
      
      await this.octokit.rest.repos.createOrUpdateFileContents({
        owner: owner,
        repo: repositoryName,
        path: "README.md",
        message: "Initial setup by Peerbot",
        content: `# ${repositoryName}`,
      });

      // Create initial directory structure
      await this.createInitialStructure(owner, repositoryName);

      const repository: UserRepository = {
        username,
        repositoryName,
        repositoryUrl: repoResponse.data.html_url,
        cloneUrl: repoResponse.data.clone_url,
        createdAt: Date.now(),
        lastUsed: Date.now(),
      };

      logger.info(`Created repository for user ${username}: ${repository.repositoryUrl}`);
      
      return repository;

    } catch (error) {
      throw new GitHubRepositoryError(
        "createUserRepository",
        username,
        `Failed to create repository for user ${username}`,
        error as Error
      );
    }
  }

  /**
   * Create initial directory structure
   */
  private async createInitialStructure(owner: string, repositoryName: string): Promise<void> {
    const directories = [
      {
        path: "projects/examples/.gitkeep",
        content: "# Example projects directory\n\nThis directory will contain example projects created by Claude.",
      },
      {
        path: "scripts/.gitkeep", 
        content: "# Scripts directory\n\nThis directory will contain utility scripts.",
      },
      {
        path: "docs/.gitkeep",
        content: "# Documentation directory\n\nThis directory will contain project documentation.",
      },
      {
        path: "workspace/.gitkeep",
        content: "# Temporary workspace\n\nThis directory is used for temporary files during Claude sessions.",
      },
    ];

    for (const dir of directories) {
      try {
        await this.octokit.rest.repos.createOrUpdateFileContents({
          owner: owner,
          repo: repositoryName,
          path: dir.path,
          message: `Create ${dir.path.split('/')[0]} directory`,
          content: Buffer.from(dir.content).toString("base64"),
        });
      } catch (error) {
        logger.warn(`Failed to create ${dir.path}:`, error);
      }
    }
  }

  /**
   * Get repository information
   */
  async getRepositoryInfo(username: string): Promise<UserRepository | null> {
    return this.repositories.get(username) || null;
  }

  /**
   * List all user repositories in the organization
   */
  async listUserRepositories(): Promise<UserRepository[]> {
    try {
      const repos = await this.octokit.rest.repos.listForOrg({
        org: this.config.organization,
        type: "all",
        sort: "updated",
        per_page: 100,
      });

      const userRepositories: UserRepository[] = [];

      for (const repo of repos.data) {
        // Assume repository name is the username (our naming convention)
        const username = repo.name;
        
        const userRepo: UserRepository = {
          username,
          repositoryName: repo.name,
          repositoryUrl: repo.html_url,
          cloneUrl: repo.clone_url || '',
          createdAt: repo.created_at ? new Date(repo.created_at).getTime() : Date.now(),
          lastUsed: repo.updated_at ? new Date(repo.updated_at).getTime() : Date.now(),
        };

        userRepositories.push(userRepo);
        
        // Cache the repository info
        this.repositories.set(username, userRepo);
      }

      return userRepositories;

    } catch (error) {
      logger.error("Failed to list user repositories:", error);
      return [];
    }
  }

  /**
   * Update repository last used timestamp
   */
  updateLastUsed(username: string): void {
    const repository = this.repositories.get(username);
    if (repository) {
      repository.lastUsed = Date.now();
    }
  }

  /**
   * Get repository stats for monitoring
   */
  getRepositoryStats(): {
    totalRepositories: number;
    recentlyUsed: number;
    cached: number;
  } {
    const now = Date.now();
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    const recentlyUsed = Array.from(this.repositories.values())
      .filter(repo => repo.lastUsed > oneWeekAgo).length;

    return {
      totalRepositories: this.repositories.size,
      recentlyUsed,
      cached: this.repositories.size,
    };
  }

  /**
   * Clear repository cache
   */
  clearCache(): void {
    this.repositories.clear();
  }

  /**
   * Check if organization exists and is accessible
   */
  async validateOrganization(): Promise<boolean> {
    try {
      await this.octokit.rest.orgs.get({
        org: this.config.organization,
      });
      return true;
    } catch (error) {
      logger.error(`Failed to access organization ${this.config.organization}:`, error);
      return false;
    }
  }

  /**
   * Get GitHub API rate limit status
   */
  async getRateLimitStatus(): Promise<{
    limit: number;
    remaining: number;
    reset: Date;
  }> {
    try {
      const response = await this.octokit.rest.rateLimit.get();
      const rateLimit = response.data.rate;
      
      return {
        limit: rateLimit.limit,
        remaining: rateLimit.remaining,
        reset: new Date(rateLimit.reset * 1000),
      };
    } catch (error) {
      return {
        limit: 0,
        remaining: 0,
        reset: new Date(),
      };
    }
  }

  /**
   * Fetch README.md content from a GitHub repository
   */
  async fetchReadmeContent(owner: string, repo: string): Promise<string | null> {
    try {
      logger.info(`Fetching README.md from ${owner}/${repo}...`);
      
      const response = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path: 'README.md',
      });

      if ('content' in response.data && response.data.content) {
        const content = Buffer.from(response.data.content, 'base64').toString('utf8');
        logger.info(`Successfully fetched README.md from ${owner}/${repo} (${content.length} characters)`);
        return content;
      }
      
      logger.warn(`README.md found but no content available for ${owner}/${repo}`);
      return null;
    } catch (error: any) {
      if (error.status === 404) {
        logger.info(`README.md not found for ${owner}/${repo}`);
        return null;
      }
      logger.error(`Failed to fetch README.md from ${owner}/${repo}:`, error);
      return null;
    }
  }
}