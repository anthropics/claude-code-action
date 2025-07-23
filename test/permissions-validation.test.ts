import { describe, expect, test, spyOn, beforeEach, afterEach } from "bun:test";
import { checkWritePermissions } from "../src/github/validation/permissions";
import type { ParsedGitHubContext } from "../src/github/context";

describe("checkWritePermissions", () => {
  let coreSpy: any;

  beforeEach(() => {
    coreSpy = {
      info: spyOn(console, "log").mockImplementation(() => {}),
      warning: spyOn(console, "warn").mockImplementation(() => {}),
      error: spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    coreSpy.info.mockRestore();
    coreSpy.warning.mockRestore();
    coreSpy.error.mockRestore();
  });

  const createContext = (actor: string = "test-user"): ParsedGitHubContext => ({
    runId: "1234567890",
    eventName: "issue_comment",
    eventAction: "created",
    repository: {
      full_name: "test-owner/test-repo",
      owner: "test-owner",
      repo: "test-repo",
    },
    actor,
    payload: {
      action: "created",
      issue: {
        number: 1,
        title: "Test Issue",
        body: "Test body",
        user: { login: actor },
      },
      comment: {
        id: 123,
        body: "@claude test",
        user: { login: actor },
        html_url:
          "https://github.com/test-owner/test-repo/issues/1#issuecomment-123",
      },
    } as any,
    entityNumber: 1,
    isPR: false,
    inputs: {
      triggerPhrase: "@claude",
      assigneeTrigger: "",
      labelTrigger: "",
      allowedTools: [],
      disallowedTools: [],
      customInstructions: "",
      directPrompt: "",
      branchPrefix: "claude/",
      useStickyComment: false,
      additionalPermissions: new Map(),
      useCommitSigning: false,
      allowBotActor: false,
    },
  });

  test("should grant write permissions to human users with write access", async () => {
    const mockOctokit = {
      users: {
        getByUsername: async () => ({
          data: { type: "User" },
        }),
      },
      repos: {
        getCollaboratorPermissionLevel: async () => ({
          data: { permission: "write" },
        }),
      },
    } as any;

    const context = createContext("human-user");
    const result = await checkWritePermissions(mockOctokit, context);

    expect(result).toBe(true);
  });

  test("should deny write permissions to human users with read access", async () => {
    const mockOctokit = {
      users: {
        getByUsername: async () => ({
          data: { type: "User" },
        }),
      },
      repos: {
        getCollaboratorPermissionLevel: async () => ({
          data: { permission: "read" },
        }),
      },
    } as any;

    const context = createContext("human-user");
    const result = await checkWritePermissions(mockOctokit, context);

    expect(result).toBe(false);
  });

  test("should grant write permissions to bots with write access via installation", async () => {
    const mockOctokit = {
      users: {
        getByUsername: async () => ({
          data: { type: "Bot" },
        }),
      },
      repos: {
        getCollaboratorPermissionLevel: async () => {
          throw new Error("Not found");
        },
        get: async () => ({
          data: {
            default_branch: "main",
            permissions: { admin: false, push: false, maintain: false },
          },
        }),
      },
      apps: {
        getRepoInstallation: async () => ({
          data: {
            id: 123,
            permissions: { contents: "write" },
          },
        }),
      },
      git: {
        getRef: async () => ({
          data: { ref: "refs/heads/main" },
        }),
      },
    } as any;

    const context = createContext("claude-bot");
    const result = await checkWritePermissions(mockOctokit, context);

    expect(result).toBe(true);
  });

  test("should grant write permissions to bots with capability test", async () => {
    const mockOctokit = {
      users: {
        getByUsername: async () => ({
          data: { type: "Bot" },
        }),
      },
      repos: {
        getCollaboratorPermissionLevel: async () => {
          throw new Error("Not found");
        },
        get: async () => ({
          data: {
            default_branch: "main",
            permissions: { admin: false, push: false, maintain: false },
          },
        }),
      },
      apps: {
        getRepoInstallation: async () => {
          throw new Error("Installation not found");
        },
      },
      git: {
        getRef: async () => ({
          data: { ref: "refs/heads/main" },
        }),
      },
    } as any;

    const context = createContext("claude-bot");
    const result = await checkWritePermissions(mockOctokit, context);

    expect(result).toBe(true);
  });

  test("should deny write permissions to bots with read access via repo permissions", async () => {
    const mockOctokit = {
      users: {
        getByUsername: async () => ({
          data: { type: "Bot" },
        }),
      },
      repos: {
        getCollaboratorPermissionLevel: async () => {
          throw new Error("Not found");
        },
        get: async () => ({
          data: {
            permissions: { admin: false, push: false, maintain: false },
          },
        }),
      },
    } as any;

    const context = createContext("claude-bot");
    const result = await checkWritePermissions(mockOctokit, context);

    expect(result).toBe(false);
  });

  test("should grant write permissions to bots with admin installation", async () => {
    const mockOctokit = {
      users: {
        getByUsername: async () => ({
          data: { type: "Bot" },
        }),
      },
      repos: {
        getCollaboratorPermissionLevel: async () => {
          throw new Error("Not found");
        },
        get: async () => ({
          data: {
            default_branch: "main",
            permissions: { admin: false, push: false, maintain: false },
          },
        }),
      },
      apps: {
        getRepoInstallation: async () => ({
          data: {
            id: 123,
            permissions: { contents: "admin" },
          },
        }),
      },
      git: {
        getRef: async () => ({
          data: { ref: "refs/heads/main" },
        }),
      },
    } as any;

    const context = createContext("claude-bot");
    const result = await checkWritePermissions(mockOctokit, context);

    expect(result).toBe(true);
  });

  test("should deny write permissions to bots with no repo permissions", async () => {
    const mockOctokit = {
      users: {
        getByUsername: async () => ({
          data: { type: "Bot" },
        }),
      },
      repos: {
        getCollaboratorPermissionLevel: async () => {
          throw new Error("Not found");
        },
        get: async () => ({
          data: {
            default_branch: "main",
            permissions: { admin: false, push: false, maintain: false },
          },
        }),
      },
      apps: {
        getRepoInstallation: async () => {
          throw new Error("Installation not found");
        },
      },
      git: {
        getRef: async () => {
          throw new Error("Access denied");
        },
      },
    } as any;

    const context = createContext("claude-bot");
    const result = await checkWritePermissions(mockOctokit, context);

    expect(result).toBe(false);
  });

  test("should deny write permissions to bots when repo.get fails", async () => {
    const mockOctokit = {
      users: {
        getByUsername: async () => ({
          data: { type: "Bot" },
        }),
      },
      repos: {
        getCollaboratorPermissionLevel: async () => {
          throw new Error("Not found");
        },
        get: async () => {
          throw new Error("Repository access denied");
        },
      },
      apps: {
        getRepoInstallation: async () => {
          throw new Error("Installation not found");
        },
      },
      git: {
        getRef: async () => {
          throw new Error("Access denied");
        },
      },
    } as any;

    const context = createContext("claude-bot");
    const result = await checkWritePermissions(mockOctokit, context);

    expect(result).toBe(false);
  });

  test("should handle API errors gracefully", async () => {
    const mockOctokit = {
      users: {
        getByUsername: async () => {
          throw new Error("API Error");
        },
      },
      repos: {
        getCollaboratorPermissionLevel: async () => {
          throw new Error("API Error");
        },
        get: async () => {
          throw new Error("API Error");
        },
      },
    } as any;

    const context = createContext("test-user");
    const result = await checkWritePermissions(mockOctokit, context);

    expect(result).toBe(false);
  });

  test("should grant write permissions to users with admin access", async () => {
    const mockOctokit = {
      users: {
        getByUsername: async () => ({
          data: { type: "User" },
        }),
      },
      repos: {
        getCollaboratorPermissionLevel: async () => ({
          data: { permission: "admin" },
        }),
      },
    } as any;

    const context = createContext("admin-user");
    const result = await checkWritePermissions(mockOctokit, context);

    expect(result).toBe(true);
  });

  test("should grant write permissions to bots with admin access via collaborator", async () => {
    const mockOctokit = {
      users: {
        getByUsername: async () => ({
          data: { type: "Bot" },
        }),
      },
      repos: {
        getCollaboratorPermissionLevel: async () => ({
          data: { permission: "admin" },
        }),
        get: async () => ({
          data: {
            permissions: { admin: true, push: false, maintain: false },
          },
        }),
      },
    } as any;

    const context = createContext("admin-bot");
    const result = await checkWritePermissions(mockOctokit, context);

    expect(result).toBe(true);
  });

  test("should grant write permissions to bots with admin access via repo permissions", async () => {
    const mockOctokit = {
      users: {
        getByUsername: async () => ({
          data: { type: "Bot" },
        }),
      },
      repos: {
        getCollaboratorPermissionLevel: async () => {
          throw new Error("Not found");
        },
        get: async () => ({
          data: {
            default_branch: "main",
            permissions: { admin: true, push: false, maintain: false },
          },
        }),
      },
      apps: {
        getRepoInstallation: async () => {
          throw new Error("Installation not found");
        },
      },
      git: {
        getRef: async () => ({
          data: { ref: "refs/heads/main" },
        }),
      },
    } as any;

    const context = createContext("admin-bot");
    const result = await checkWritePermissions(mockOctokit, context);

    expect(result).toBe(true);
  });

  test("should continue when getActorType fails", async () => {
    const mockOctokit = {
      users: {
        getByUsername: async () => {
          throw new Error("User not found");
        },
      },
      repos: {
        getCollaboratorPermissionLevel: async () => ({
          data: { permission: "write" },
        }),
        get: async () => ({
          data: {
            permissions: { admin: false, push: true, maintain: false },
          },
        }),
      },
    } as any;

    const context = createContext("unknown-user");
    const result = await checkWritePermissions(mockOctokit, context);

    expect(result).toBe(true);
  });

  test("should handle repo without permissions object", async () => {
    const mockOctokit = {
      users: {
        getByUsername: async () => ({
          data: { type: "Bot" },
        }),
      },
      repos: {
        getCollaboratorPermissionLevel: async () => {
          throw new Error("Not found");
        },
        get: async () => ({
          data: {
            default_branch: "main",
            // permissions is undefined
          },
        }),
      },
      apps: {
        getRepoInstallation: async () => {
          throw new Error("Installation not found");
        },
      },
      git: {
        getRef: async () => {
          throw new Error("Access denied");
        },
      },
    } as any;

    const context = createContext("bot-no-perms");
    const result = await checkWritePermissions(mockOctokit, context);

    expect(result).toBe(false);
  });
});
