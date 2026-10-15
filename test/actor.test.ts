#!/usr/bin/env bun

import { describe, test, expect } from "bun:test";
import { checkHumanActor } from "../src/github/validation/actor";
import type { Octokit } from "@octokit/rest";
import { createMockAutomationContext, createMockContext } from "./mockContext";

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
    // Users API. allowed_bots is applied once the API has resolved the
    // actor as not being a regular user account.

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

  describe("merge_group events", () => {
    // GitHub attributes a merge_group run to whoever queued the pull request,
    // so the actor gets the same check as on any other event.

    test("should pass when a person queued the pull request", async () => {
      const mockOctokit = createMockOctokit("User");
      const context = createMockAutomationContext({
        eventName: "merge_group",
        actor: "human-user",
        inputs: { allowedBots: "" },
      });

      await expect(
        checkHumanActor(mockOctokit, context),
      ).resolves.toBeUndefined();
    });

    test.each(["merge-bot", "github-merge-queue"])(
      "should reject %s[bot] without allowed_bots",
      async (name) => {
        const mockOctokit = createMockOctokit("Bot");
        const context = createMockAutomationContext({
          eventName: "merge_group",
          actor: `${name}[bot]`,
          inputs: { allowedBots: "" },
        });

        await expect(checkHumanActor(mockOctokit, context)).rejects.toThrow(
          `Workflow initiated by non-human actor: ${name} (type: Bot). Add bot to allowed_bots list or use '*' to allow all bots.`,
        );
      },
    );

    test("should pass for an app that queued the pull request when it is in allowed_bots", async () => {
      const mockOctokit = createMockOctokit("Bot");
      const context = createMockAutomationContext({
        eventName: "merge_group",
        actor: "merge-bot[bot]",
        inputs: { allowedBots: "merge-bot" },
      });

      await expect(
        checkHumanActor(mockOctokit, context),
      ).resolves.toBeUndefined();
    });
  });

  describe("account type resolution", () => {
    // The Users API resolves the actor's account type before allowed_bots
    // is consulted. allowed_bots is only relevant for Bot accounts and
    // unresolvable app actors; it does not change behavior for regular
    // User accounts.

    test("should pass for a User account whose name matches allowed_bots", async () => {
      const mockOctokit = createMockOctokit("User");
      const context = createMockContext();
      context.actor = "renovate";
      context.inputs.allowedBots = "renovate";

      await expect(
        checkHumanActor(mockOctokit, context),
      ).resolves.toBeUndefined();
    });

    test("should pass for a User account when allowed_bots is '*'", async () => {
      const mockOctokit = createMockOctokit("User");
      const context = createMockContext();
      context.actor = "some-user";
      context.inputs.allowedBots = "*";

      await expect(
        checkHumanActor(mockOctokit, context),
      ).resolves.toBeUndefined();
    });

    test("should resolve account type even when actor name appears in allowed_bots", async () => {
      // The Users API call should not be short-circuited by allowed_bots,
      // so an unexpected API error propagates instead of being swallowed.
      const mockOctokit = {
        users: {
          getByUsername: async () => {
            throw new Error("Internal Server Error");
          },
        },
      } as unknown as Octokit;
      const context = createMockContext();
      context.actor = "some-user";
      context.inputs.allowedBots = "some-user";

      await expect(checkHumanActor(mockOctokit, context)).rejects.toThrow(
        "Internal Server Error",
      );
    });
  });
});
