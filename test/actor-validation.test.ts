import { describe, expect, test, spyOn, beforeEach, afterEach } from "bun:test";
import { checkHumanActor } from "../src/github/validation/actor";
import type { ParsedGitHubContext } from "../src/github/context";

describe("checkHumanActor", () => {
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  const createMockOctokit = (userType: "User" | "Bot") => {
    return {
      users: {
        getByUsername: async () => ({
          data: { type: userType },
        }),
      },
    } as any;
  };

  const createContext = (
    actor: string = "test-user",
    allowBotActor: boolean = false,
  ): ParsedGitHubContext => ({
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
      allowBotActor,
    },
  });

  test("should pass for human users", async () => {
    const mockOctokit = createMockOctokit("User");
    const context = createContext("human-user");

    await expect(
      checkHumanActor(mockOctokit, context),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith("Actor type: User");
    expect(consoleSpy).toHaveBeenCalledWith("Verified human actor: human-user");
  });

  test("should reject bot actors by default", async () => {
    const mockOctokit = createMockOctokit("Bot");
    const context = createContext("bot-actor");

    await expect(checkHumanActor(mockOctokit, context)).rejects.toThrow(
      "Workflow initiated by non-human actor: bot-actor (type: Bot).",
    );

    expect(consoleSpy).toHaveBeenCalledWith("Actor type: Bot");
  });

  test("should allow bot actors when allowBotActor is true", async () => {
    const mockOctokit = createMockOctokit("Bot");
    const context = createContext("bot-actor", true);

    await expect(
      checkHumanActor(mockOctokit, context),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith("Actor type: Bot");
    expect(consoleSpy).toHaveBeenCalledWith(
      "Bot actor allowed, skipping human actor check for: bot-actor",
    );
  });

  test("should call GitHub API with correct username", async () => {
    let capturedUsername: string;
    const mockOctokit = {
      users: {
        getByUsername: async (params: { username: string }) => {
          capturedUsername = params.username;
          return { data: { type: "User" } };
        },
      },
    } as any;
    const context = createContext("test-actor");

    await checkHumanActor(mockOctokit, context);

    expect(capturedUsername!).toBe("test-actor");
  });

  test("should propagate GitHub API errors", async () => {
    const error = new Error("User not found");
    const mockOctokit = {
      users: {
        getByUsername: async () => {
          throw error;
        },
      },
    } as any;
    const context = createContext("nonexistent-user");

    await expect(checkHumanActor(mockOctokit, context)).rejects.toThrow(
      "Could not determine actor type for: nonexistent-user",
    );
  });
});
