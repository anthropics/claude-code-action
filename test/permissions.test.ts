import { describe, expect, test, spyOn, beforeEach, afterEach } from "bun:test";
import * as core from "@actions/core";
import {
  checkWritePermissions,
  isActorInAllowedBots,
} from "../src/github/validation/permissions";
import type { ParsedGitHubContext } from "../src/github/context";
import { CLAUDE_APP_BOT_ID, CLAUDE_BOT_LOGIN } from "../src/github/constants";

describe("checkWritePermissions", () => {
  let coreInfoSpy: any;
  let coreWarningSpy: any;
  let coreErrorSpy: any;

  beforeEach(() => {
    // Spy on core methods
    coreInfoSpy = spyOn(core, "info").mockImplementation(() => {});
    coreWarningSpy = spyOn(core, "warning").mockImplementation(() => {});
    coreErrorSpy = spyOn(core, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    coreInfoSpy.mockRestore();
    coreWarningSpy.mockRestore();
    coreErrorSpy.mockRestore();
  });

  const createMockOctokit = (permission: string) => {
    return {
      repos: {
        getCollaboratorPermissionLevel: async () => ({
          data: { permission },
        }),
      },
    } as any;
  };

  const createContext = (): ParsedGitHubContext => ({
    runId: "1234567890",
    eventName: "issue_comment",
    eventAction: "created",
    repository: {
      full_name: "test-owner/test-repo",
      owner: "test-owner",
      repo: "test-repo",
    },
    actor: "test-user",
    payload: {
      action: "created",
      issue: {
        number: 1,
        title: "Test Issue",
        body: "Test body",
        user: { login: "test-user" },
      },
      comment: {
        id: 123,
        body: "@claude test",
        user: { login: "test-user" },
        html_url:
          "https://github.com/test-owner/test-repo/issues/1#issuecomment-123",
      },
    } as any,
    entityNumber: 1,
    isPR: false,
    inputs: {
      prompt: "",
      triggerPhrase: "@claude",
      assigneeTrigger: "",
      labelTrigger: "",
      branchPrefix: "claude/",
      useStickyComment: false,
      classifyInlineComments: true,
      useCommitSigning: false,
      sshSigningKey: "",
      botId: String(CLAUDE_APP_BOT_ID),
      botName: CLAUDE_BOT_LOGIN,
      allowedBots: "",
      allowedNonWriteUsers: "",
      trackProgress: false,
      includeFixLinks: true,
      includeCommentsByActor: "",
      excludeCommentsByActor: "",
    },
  });

  test("should return true for admin permissions", async () => {
    const mockOctokit = createMockOctokit("admin");
    const context = createContext();

    const result = await checkWritePermissions(mockOctokit, context);

    expect(result).toBe(true);
    expect(coreInfoSpy).toHaveBeenCalledWith(
      "Checking permissions for actor: test-user",
    );
    expect(coreInfoSpy).toHaveBeenCalledWith(
      "Permission level retrieved: admin",
    );
    expect(coreInfoSpy).toHaveBeenCalledWith("Actor has write access: admin");
  });

  test("should return true for write permissions", async () => {
    const mockOctokit = createMockOctokit("write");
    const context = createContext();

    const result = await checkWritePermissions(mockOctokit, context);

    expect(result).toBe(true);
    expect(coreInfoSpy).toHaveBeenCalledWith("Actor has write access: write");
  });

  test("should return false for read permissions", async () => {
    const mockOctokit = createMockOctokit("read");
    const context = createContext();

    const result = await checkWritePermissions(mockOctokit, context);

    expect(result).toBe(false);
    expect(coreWarningSpy).toHaveBeenCalledWith(
      "Actor has insufficient permissions: read",
    );
  });

  test("should return false for none permissions", async () => {
    const mockOctokit = createMockOctokit("none");
    const context = createContext();

    const result = await checkWritePermissions(mockOctokit, context);

    expect(result).toBe(false);
    expect(coreWarningSpy).toHaveBeenCalledWith(
      "Actor has insufficient permissions: none",
    );
  });

  test("should return true for bot user", async () => {
    const mockOctokit = createMockOctokit("none");
    const context = createContext();
    context.actor = "test-bot[bot]";

    const result = await checkWritePermissions(mockOctokit, context);

    expect(result).toBe(true);
  });

  test("should throw error when permission check fails", async () => {
    const error = new Error("API error");
    const mockOctokit = {
      repos: {
        getCollaboratorPermissionLevel: async () => {
          throw error;
        },
      },
    } as any;
    const context = createContext();

    await expect(checkWritePermissions(mockOctokit, context)).rejects.toThrow(
      "Failed to check permissions for test-user: Error: API error",
    );

    expect(coreErrorSpy).toHaveBeenCalledWith(
      "Failed to check permissions: Error: API error",
    );
  });

  test("should call API with correct parameters", async () => {
    let capturedParams: any;
    const mockOctokit = {
      repos: {
        getCollaboratorPermissionLevel: async (params: any) => {
          capturedParams = params;
          return { data: { permission: "write" } };
        },
      },
    } as any;
    const context = createContext();

    await checkWritePermissions(mockOctokit, context);

    expect(capturedParams).toEqual({
      owner: "test-owner",
      repo: "test-repo",
      username: "test-user",
    });
  });

  describe("allowed_non_write_users bypass", () => {
    test("should bypass permission check for specific user when github_token provided", async () => {
      const mockOctokit = createMockOctokit("read");
      const context = createContext();

      const result = await checkWritePermissions(
        mockOctokit,
        context,
        "test-user,other-user",
        true,
      );

      expect(result).toBe(true);
      expect(coreWarningSpy).toHaveBeenCalledWith(
        "⚠️ SECURITY WARNING: Bypassing write permission check for test-user due to allowed_non_write_users configuration. This should only be used for workflows with very limited permissions.",
      );
    });

    test("should bypass permission check for all users with wildcard", async () => {
      const mockOctokit = createMockOctokit("read");
      const context = createContext();

      const result = await checkWritePermissions(
        mockOctokit,
        context,
        "*",
        true,
      );

      expect(result).toBe(true);
      expect(coreWarningSpy).toHaveBeenCalledWith(
        "⚠️ SECURITY WARNING: Bypassing write permission check for test-user due to allowed_non_write_users='*'. This should only be used for workflows with very limited permissions.",
      );
    });

    test("should NOT bypass permission check when user not in allowed list", async () => {
      const mockOctokit = createMockOctokit("read");
      const context = createContext();

      const result = await checkWritePermissions(
        mockOctokit,
        context,
        "other-user,another-user",
        true,
      );

      expect(result).toBe(false);
      expect(coreWarningSpy).toHaveBeenCalledWith(
        "Actor has insufficient permissions: read",
      );
    });

    test("should NOT bypass permission check when github_token not provided", async () => {
      const mockOctokit = createMockOctokit("read");
      const context = createContext();

      const result = await checkWritePermissions(
        mockOctokit,
        context,
        "test-user",
        false,
      );

      expect(result).toBe(false);
      expect(coreWarningSpy).toHaveBeenCalledWith(
        "Actor has insufficient permissions: read",
      );
    });

    test("should NOT bypass permission check when allowed_non_write_users is empty", async () => {
      const mockOctokit = createMockOctokit("read");
      const context = createContext();

      const result = await checkWritePermissions(
        mockOctokit,
        context,
        "",
        true,
      );

      expect(result).toBe(false);
      expect(coreWarningSpy).toHaveBeenCalledWith(
        "Actor has insufficient permissions: read",
      );
    });

    test("should handle whitespace in allowed_non_write_users list", async () => {
      const mockOctokit = createMockOctokit("read");
      const context = createContext();

      const result = await checkWritePermissions(
        mockOctokit,
        context,
        " test-user , other-user ",
        true,
      );

      expect(result).toBe(true);
      expect(coreWarningSpy).toHaveBeenCalledWith(
        "⚠️ SECURITY WARNING: Bypassing write permission check for test-user due to allowed_non_write_users configuration. This should only be used for workflows with very limited permissions.",
      );
    });

    test("should bypass for bot users even when allowed_non_write_users is set", async () => {
      const mockOctokit = createMockOctokit("none");
      const context = createContext();
      context.actor = "test-bot[bot]";

      const result = await checkWritePermissions(
        mockOctokit,
        context,
        "some-user",
        true,
      );

      expect(result).toBe(true);
      expect(coreInfoSpy).toHaveBeenCalledWith(
        "Actor is a GitHub App: test-bot[bot]",
      );
    });
  });

  describe("allowed_bots bypass", () => {
    test("should bypass permission check for bot actor in allowed_bots list", async () => {
      const mockOctokit = createMockOctokit("none");
      const context = createContext();
      context.actor = "Copilot";

      const result = await checkWritePermissions(
        mockOctokit,
        context,
        undefined,
        undefined,
        "Copilot",
      );

      expect(result).toBe(true);
      expect(coreInfoSpy).toHaveBeenCalledWith(
        "Actor Copilot is in allowed_bots list, bypassing permission check",
      );
    });

    test("should match case-insensitively (Copilot vs copilot)", async () => {
      const mockOctokit = createMockOctokit("none");
      const context = createContext();
      context.actor = "Copilot";

      const result = await checkWritePermissions(
        mockOctokit,
        context,
        undefined,
        undefined,
        "copilot,renovate",
      );

      expect(result).toBe(true);
    });

    test("should match actor with [bot] suffix against normalized allowed_bots entry", async () => {
      const mockOctokit = createMockOctokit("none");
      const context = createContext();
      context.actor = "renovate[bot]";

      const result = await checkWritePermissions(
        mockOctokit,
        context,
        undefined,
        undefined,
        "renovate",
      );

      expect(result).toBe(true);
    });

    test("should bypass permission check for all bots with wildcard", async () => {
      const mockOctokit = createMockOctokit("none");
      const context = createContext();
      context.actor = "Copilot";

      const result = await checkWritePermissions(
        mockOctokit,
        context,
        undefined,
        undefined,
        "*",
      );

      expect(result).toBe(true);
      expect(coreWarningSpy).toHaveBeenCalledWith(
        expect.stringContaining("⚠️ SECURITY WARNING"),
      );
      expect(coreWarningSpy).toHaveBeenCalledWith(
        expect.stringContaining("allowed_bots='*'"),
      );
    });

    test("should NOT bypass when actor is not in allowed_bots list", async () => {
      const mockOctokit = createMockOctokit("write");
      const context = createContext();
      context.actor = "some-human";

      const result = await checkWritePermissions(
        mockOctokit,
        context,
        undefined,
        undefined,
        "Copilot,renovate",
      );

      // Falls through to collaborators API — returns write
      expect(result).toBe(true);
      expect(coreInfoSpy).toHaveBeenCalledWith(
        "Permission level retrieved: write",
      );
    });

    test("should NOT bypass when allowed_bots is empty", async () => {
      const mockOctokit = createMockOctokit("write");
      const context = createContext();
      context.actor = "Copilot";

      const result = await checkWritePermissions(
        mockOctokit,
        context,
        undefined,
        undefined,
        "",
      );

      // Falls through to collaborators API
      expect(result).toBe(true);
      expect(coreInfoSpy).toHaveBeenCalledWith(
        "Permission level retrieved: write",
      );
    });

    test("should NOT bypass when allowed_bots is undefined", async () => {
      const mockOctokit = createMockOctokit("write");
      const context = createContext();
      context.actor = "Copilot";

      const result = await checkWritePermissions(mockOctokit, context);

      // Falls through to collaborators API
      expect(result).toBe(true);
      expect(coreInfoSpy).toHaveBeenCalledWith(
        "Permission level retrieved: write",
      );
    });
  });
});

describe("isActorInAllowedBots", () => {
  test("returns false for empty allowedBots", () => {
    expect(isActorInAllowedBots("Copilot", "")).toBe(false);
  });

  test("returns false for whitespace-only allowedBots", () => {
    expect(isActorInAllowedBots("Copilot", "   ")).toBe(false);
  });

  test("returns true for wildcard", () => {
    expect(isActorInAllowedBots("anyone", "*")).toBe(true);
    expect(isActorInAllowedBots("Copilot", "*")).toBe(true);
  });

  test("returns true for exact match", () => {
    expect(isActorInAllowedBots("Copilot", "Copilot")).toBe(true);
  });

  test("returns true for case-insensitive match", () => {
    expect(isActorInAllowedBots("Copilot", "copilot")).toBe(true);
    expect(isActorInAllowedBots("copilot", "Copilot")).toBe(true);
    expect(isActorInAllowedBots("COPILOT", "copilot")).toBe(true);
  });

  test("returns true when actor has [bot] suffix, entry does not", () => {
    expect(isActorInAllowedBots("renovate[bot]", "renovate")).toBe(true);
  });

  test("returns true when actor has no [bot] suffix, entry does", () => {
    expect(isActorInAllowedBots("renovate", "renovate[bot]")).toBe(true);
  });

  test("returns true when actor is in comma-separated list", () => {
    expect(isActorInAllowedBots("Copilot", "dependabot,Copilot,renovate")).toBe(
      true,
    );
  });

  test("returns false when actor is not in list", () => {
    expect(isActorInAllowedBots("attacker", "Copilot,renovate")).toBe(false);
  });

  test("handles whitespace around entries", () => {
    expect(isActorInAllowedBots("Copilot", " Copilot , renovate ")).toBe(true);
  });
});
