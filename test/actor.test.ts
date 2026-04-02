#!/usr/bin/env bun

import { describe, test, expect } from "bun:test";
import { checkHumanActor } from "../src/github/validation/actor";
import type { Octokit } from "@octokit/rest";
import { createMockContext } from "./mockContext";

function createMockOctokit(userType: string): Octokit {
  return {
    users: {
      getByUsername: async () => ({
        data: {
          type: userType,
        },
      }),
    },
  } as unknown as Octokit;
}

describe("checkHumanActor", () => {
  test("should pass for human actor", async () => {
    const mockOctokit = createMockOctokit("User");
    const context = createMockContext();
    context.actor = "human-user";

    await expect(
      checkHumanActor(mockOctokit, context),
    ).resolves.toBeUndefined();
  });

  test("should throw error for bot actor when not allowed", async () => {
    const mockOctokit = createMockOctokit("Bot");
    const context = createMockContext();
    context.actor = "test-bot[bot]";
    context.inputs.allowedBots = "";

    await expect(checkHumanActor(mockOctokit, context)).rejects.toThrow(
      "Workflow initiated by non-human actor: test-bot (type: Bot). Add bot to allowed_bots list or use '*' to allow all bots.",
    );
  });

  test("should pass for bot actor when all bots allowed", async () => {
    const mockOctokit = createMockOctokit("Bot");
    const context = createMockContext();
    context.actor = "test-bot[bot]";
    context.inputs.allowedBots = "*";

    await expect(
      checkHumanActor(mockOctokit, context),
    ).resolves.toBeUndefined();
  });

  test("should pass for specific bot when in allowed list", async () => {
    const mockOctokit = createMockOctokit("Bot");
    const context = createMockContext();
    context.actor = "dependabot[bot]";
    context.inputs.allowedBots = "dependabot[bot],renovate[bot]";

    await expect(
      checkHumanActor(mockOctokit, context),
    ).resolves.toBeUndefined();
  });

  test("should pass for specific bot when in allowed list (without [bot])", async () => {
    const mockOctokit = createMockOctokit("Bot");
    const context = createMockContext();
    context.actor = "dependabot[bot]";
    context.inputs.allowedBots = "dependabot,renovate";

    await expect(
      checkHumanActor(mockOctokit, context),
    ).resolves.toBeUndefined();
  });

  test("should throw error for bot not in allowed list", async () => {
    const mockOctokit = createMockOctokit("Bot");
    const context = createMockContext();
    context.actor = "other-bot[bot]";
    context.inputs.allowedBots = "dependabot[bot],renovate[bot]";

    await expect(checkHumanActor(mockOctokit, context)).rejects.toThrow(
      "Workflow initiated by non-human actor: other-bot (type: Bot). Add bot to allowed_bots list or use '*' to allow all bots.",
    );
  });

  test("should throw error for bot not in allowed list (without [bot])", async () => {
    const mockOctokit = createMockOctokit("Bot");
    const context = createMockContext();
    context.actor = "other-bot[bot]";
    context.inputs.allowedBots = "dependabot,renovate";

    await expect(checkHumanActor(mockOctokit, context)).rejects.toThrow(
      "Workflow initiated by non-human actor: other-bot (type: Bot). Add bot to allowed_bots list or use '*' to allow all bots.",
    );
  });

  describe("non-[bot] actors (e.g. GitHub Copilot)", () => {
    // GitHub Copilot SWE Agent sets GITHUB_ACTOR="Copilot" which is not a
    // valid GitHub user and doesn't end with [bot], causing 404 on the
    // Users API. These tests verify the fix handles this gracefully.

    function createMockOctokitThat404s(): Octokit {
      return {
        users: {
          getByUsername: async () => {
            const err = new Error("Not Found");
            (err as any).status = 404;
            throw err;
          },
        },
      } as unknown as Octokit;
    }

    test("should pass for non-[bot] actor when in allowed_bots list", async () => {
      const mockOctokit = createMockOctokitThat404s();
      const context = createMockContext();
      context.actor = "Copilot";
      context.inputs.allowedBots = "copilot,cursor";

      // Should not even call the API — allowed_bots check happens first
      await expect(
        checkHumanActor(mockOctokit, context),
      ).resolves.toBeUndefined();
    });

    test("should pass for non-[bot] actor when all bots are allowed", async () => {
      const mockOctokit = createMockOctokitThat404s();
      const context = createMockContext();
      context.actor = "Copilot";
      context.inputs.allowedBots = "*";

      await expect(
        checkHumanActor(mockOctokit, context),
      ).resolves.toBeUndefined();
    });

    test("should throw with clear message for non-[bot] actor that 404s and is not in allowed list", async () => {
      const mockOctokit = createMockOctokitThat404s();
      const context = createMockContext();
      context.actor = "Copilot";
      context.inputs.allowedBots = "cursor";

      await expect(checkHumanActor(mockOctokit, context)).rejects.toThrow(
        "Workflow initiated by non-human actor: copilot (actor not found on GitHub). Add bot to allowed_bots list or use '*' to allow all bots.",
      );
    });

    test("should throw with clear message for non-[bot] actor that 404s and allowed_bots is empty", async () => {
      const mockOctokit = createMockOctokitThat404s();
      const context = createMockContext();
      context.actor = "Copilot";
      context.inputs.allowedBots = "";

      await expect(checkHumanActor(mockOctokit, context)).rejects.toThrow(
        "Workflow initiated by non-human actor: copilot (actor not found on GitHub). Add bot to allowed_bots list or use '*' to allow all bots.",
      );
    });

    test("should match allowed_bots case-insensitively for non-[bot] actors", async () => {
      const mockOctokit = createMockOctokitThat404s();
      const context = createMockContext();
      context.actor = "Copilot";
      context.inputs.allowedBots = "COPILOT";

      await expect(
        checkHumanActor(mockOctokit, context),
      ).resolves.toBeUndefined();
    });
  });
});
