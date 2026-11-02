#!/usr/bin/env bun

import { describe, test, expect, mock } from "bun:test";
import { checkHumanActor } from "../src/github/validation/actor";
import type { Octokit } from "@octokit/rest";
import { createMockContext, createMockAutomationContext } from "./mockContext";

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

// Mirrors the reported #1348 failure: the Users API returns 401 even though
// the repo-scoped permission check succeeded. The mock also records calls so
// tests can assert the payload path skipped the API entirely.
function createMockOctokitThatThrows401(): {
  octokit: Octokit;
  getByUsername: ReturnType<typeof mock>;
} {
  const getByUsername = mock(async () => {
    const err = new Error("Bad credentials - https://docs.github.com/rest");
    (err as any).status = 401;
    throw err;
  });
  const octokit = {
    users: { getByUsername },
  } as unknown as Octokit;
  return { octokit, getByUsername };
}

// Builds an entity `*.labeled` context carrying a typed webhook sender, the
// payload shape that lets checkHumanActor classify the actor without the API.
function createSenderContext({
  eventName = "pull_request",
  eventAction = "labeled",
  actor = "maintainer",
  senderLogin = actor,
  senderType = "User",
  allowedBots = "",
}: {
  eventName?: "pull_request" | "issues";
  eventAction?: string;
  actor?: string;
  senderLogin?: string;
  senderType?: "User" | "Bot" | "Organization";
  allowedBots?: string;
}) {
  return createMockContext({
    eventName,
    eventAction,
    isPR: eventName === "pull_request",
    actor,
    payload: {
      action: eventAction,
      sender: { login: senderLogin, type: senderType },
    } as any,
    inputs: { allowedBots },
  });
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

  describe("account type from event payload (#1348)", () => {
    // Entity webhook events carry a typed `sender` with the triggering
    // account's login and type. When that sender is the same identity being
    // validated, checkHumanActor classifies the actor from the payload and
    // skips the Users API — which can 401 on labeled events under the default
    // OIDC + App-token-exchange auth even after repo-scoped calls succeed.
    // The API remains the fallback when the payload has no matching sender.
    // (The existing tests above, which use empty synthetic payloads, cover
    // that fallback path.)

    test("uses sender type for pull_request.labeled (case-insensitive), skipping the Users API", async () => {
      const { octokit, getByUsername } = createMockOctokitThatThrows401();
      // Actor casing differs from the sender login to also exercise the
      // case-insensitive identity match.
      const context = createSenderContext({
        actor: "Maintainer",
        senderLogin: "maintainer",
      });

      await expect(checkHumanActor(octokit, context)).resolves.toBeUndefined();
      expect(getByUsername).not.toHaveBeenCalled();
    });

    test("uses sender type for issues.labeled, skipping the Users API", async () => {
      const { octokit, getByUsername } = createMockOctokitThatThrows401();
      const context = createSenderContext({ eventName: "issues" });

      await expect(checkHumanActor(octokit, context)).resolves.toBeUndefined();
      expect(getByUsername).not.toHaveBeenCalled();
    });

    test("uses sender type for workflow_dispatch, skipping the Users API", async () => {
      // The optimization keys off the sender identity, not the event category:
      // automation events (reached via agent mode) also carry a typed sender at
      // runtime, so they skip the Users API too. This proves the behavior is
      // neither labeled- nor entity-specific.
      const { octokit, getByUsername } = createMockOctokitThatThrows401();
      const context = createMockAutomationContext({
        eventName: "workflow_dispatch",
        actor: "maintainer",
        payload: { sender: { login: "maintainer", type: "User" } } as any,
      });

      await expect(checkHumanActor(octokit, context)).resolves.toBeUndefined();
      expect(getByUsername).not.toHaveBeenCalled();
    });

    test("falls back to the Users API when the event has no sender", async () => {
      // A schedule event carries no sender, so the account type must still be
      // resolved through the Users API. This is the real fallback invariant:
      // missing sender metadata, not "automation event".
      const getByUsername = mock(async () => ({ data: { type: "User" } }));
      const octokit = {
        users: { getByUsername },
      } as unknown as Octokit;
      const context = createMockAutomationContext({
        eventName: "schedule",
        actor: "maintainer",
        payload: {
          schedule: "0 0 * * *",
          repository: { name: "test-repo", owner: { login: "test-owner" } },
        } as any,
      });

      await expect(checkHumanActor(octokit, context)).resolves.toBeUndefined();
      expect(getByUsername).toHaveBeenCalled();
    });

    test("rejects a disallowed bot sender without calling the Users API", async () => {
      const { octokit, getByUsername } = createMockOctokitThatThrows401();
      const context = createSenderContext({
        actor: "scanner[bot]",
        senderType: "Bot",
        allowedBots: "",
      });

      await expect(checkHumanActor(octokit, context)).rejects.toThrow(
        "Workflow initiated by non-human actor: scanner (type: Bot). Add bot to allowed_bots list or use '*' to allow all bots.",
      );
      expect(getByUsername).not.toHaveBeenCalled();
    });

    test("accepts an allowed bot sender without calling the Users API", async () => {
      const { octokit, getByUsername } = createMockOctokitThatThrows401();
      const context = createSenderContext({
        actor: "scanner[bot]",
        senderType: "Bot",
        allowedBots: "scanner",
      });

      await expect(checkHumanActor(octokit, context)).resolves.toBeUndefined();
      expect(getByUsername).not.toHaveBeenCalled();
    });

    test("falls back to the Users API when the sender login does not match the actor", async () => {
      // A mismatched sender must never authorize a different actor: the
      // payload is ignored and the existing API lookup runs (and here its
      // 401 propagates, exactly as before this optimization).
      const { octokit, getByUsername } = createMockOctokitThatThrows401();
      const context = createSenderContext({
        actor: "maintainer",
        senderLogin: "different-user",
      });

      await expect(checkHumanActor(octokit, context)).rejects.toThrow(
        "Bad credentials",
      );
      expect(getByUsername).toHaveBeenCalled();
    });
  });
});
