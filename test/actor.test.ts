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
});
