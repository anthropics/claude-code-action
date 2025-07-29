#!/usr/bin/env bun

import { Octokit } from "@octokit/rest";
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
   * Ensure user repository exists, create if needed
   */
  async ensureUserRepository(username: string): Promise<UserRepository> {
    try {
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
      
      // First, try to find the repository under the configured organization/user
      const possibleOwners = [this.config.organization];
      
      // Also check if it exists under the authenticated user
      try {
        const authUser = await this.octokit.rest.users.getAuthenticated();
        if (authUser.data.login !== this.config.organization) {
          possibleOwners.push(authUser.data.login);
        }
      } catch (e) {
        console.warn('Could not get authenticated user:', e);
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
          
          console.log(`Found existing repository for user ${username} under ${owner}: ${repository.repositoryUrl}`);
          foundRepo = true;
          break;
          
        } catch (error: any) {
          if (error.status !== 404) {
            throw error;
          }
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
      
      console.log(`Creating repository for user ${username}...`);
      
      // Check if the configured organization is actually a user account
      let repoResponse;
      try {
        // First try to create in org
        repoResponse = await this.octokit.rest.repos.createInOrg({
          org: this.config.organization,
          name: repositoryName,
          description: `Personal workspace for ${username} - Claude Code Slack Bot`,
          private: false,
          has_issues: true,
          has_projects: false,
          has_wiki: false,
          auto_init: true,
          gitignore_template: "Node",
          license_template: "mit",
        });
      } catch (orgError: any) {
        // If org creation fails with 404, try creating for authenticated user
        if (orgError.status === 404) {
          console.log(`Organization ${this.config.organization} not found, trying to create repo for authenticated user...`);
          repoResponse = await this.octokit.rest.repos.createForAuthenticatedUser({
            name: repositoryName,
            description: `Personal workspace for ${username} - Claude Code Slack Bot`,
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

      // Create initial README
      const readmeContent = this.generateInitialReadme(username);
      
      // Use the actual owner from the response
      const owner = repoResponse.data.owner.login;
      
      await this.octokit.rest.repos.createOrUpdateFileContents({
        owner: owner,
        repo: repositoryName,
        path: "README.md",
        message: "Initial setup by Claude Code Slack Bot",
        content: Buffer.from(readmeContent).toString("base64"),
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

      console.log(`Created repository for user ${username}: ${repository.repositoryUrl}`);
      
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
   * Generate initial README content
   */
  private generateInitialReadme(username: string): string {
    return `# ${username}'s Workspace

This is your personal workspace for the Claude Code Slack Bot.

## How it works

1. **Mention @peerbotai** in any Slack channel or send a direct message
2. **Each thread** becomes a persistent conversation with Claude
3. **All changes** are automatically committed to this repository
4. **Resume conversations** by replying to existing threads

## Repository Structure

\`\`\`
├── projects/          # Your coding projects
│   └── examples/      # Example projects
├── scripts/           # Utility scripts
├── docs/              # Documentation
└── workspace/         # Temporary workspace (auto-cleaned)
\`\`\`

## Recent Sessions

<!-- Session history will be updated automatically -->

## Getting Started

Try asking Claude to:
- Create a simple Python script
- Set up a React project
- Debug existing code
- Write documentation
- Analyze code quality

## Links

- 📝 [Edit on GitHub.dev](https://github.dev/${this.config.organization}/${username})
- 🔄 [Create Pull Request](https://github.com/${this.config.organization}/${username}/compare)
- 📊 [Repository Insights](https://github.com/${this.config.organization}/${username}/pulse)

---

*This workspace is managed by the Claude Code Slack Bot. All interactions are logged and persisted automatically.*
`;
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
        console.warn(`Failed to create ${dir.path}:`, error);
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
          cloneUrl: repo.clone_url,
          createdAt: new Date(repo.created_at).getTime(),
          lastUsed: new Date(repo.updated_at).getTime(),
        };

        userRepositories.push(userRepo);
        
        // Cache the repository info
        this.repositories.set(username, userRepo);
      }

      return userRepositories;

    } catch (error) {
      console.error("Failed to list user repositories:", error);
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
      console.error(`Failed to access organization ${this.config.organization}:`, error);
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
}