#!/usr/bin/env bun

/**
 * Check if the action trigger is from a human actor
 * Prevents automated tools or bots from triggering Claude
 */

import type { Octokit } from "@octokit/rest";
import type { GitHubContext } from "../context";

function isAllowedBot(actor: string, allowedBots: string): boolean {
  const trimmed = allowedBots.trim();
  if (trimmed === "*") return true;
  if (!trimmed) return false;

  const allowedList = trimmed
    .split(",")
    .map((bot) =>
      bot
        .trim()
        .toLowerCase()
        .replace(/\[bot\]$/, ""),
    )
    .filter((bot) => bot.length > 0);

  const normalizedActor = actor.toLowerCase().replace(/\[bot\]$/, "");
  return allowedList.includes(normalizedActor);
}

export async function checkHumanActor(
  octokit: Octokit,
  githubContext: GitHubContext,
) {
  const allowedBots = githubContext.inputs.allowedBots;
  const actor = githubContext.actor;

  // Resolve the actor's account type before consulting allowed_bots so the
  // allow-list only ever applies to non-User accounts. Some app actors
  // (e.g. GitHub Copilot with GITHUB_ACTOR="Copilot") are not resolvable
  // via the Users API and 404 — that path is handled in the catch below.
  let actorType: string;
  try {
    const { data: userData } = await octokit.users.getByUsername({
      username: actor,
    });
    actorType = userData.type;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("Not Found") ||
        error.message.includes("is not a user"))
    ) {
      // Unresolvable actors are GitHub Apps without a backing user account.
      if (isAllowedBot(actor, allowedBots)) {
        console.log(
          `Actor ${actor} is in allowed_bots list, skipping human actor check`,
        );
        return;
      }
      const botName = actor.toLowerCase().replace(/\[bot\]$/, "");
      throw new Error(
        `Workflow initiated by non-human actor: ${botName} (actor not found on GitHub). Add bot to allowed_bots list or use '*' to allow all bots.`,
      );
    }
    throw error;
  }

  console.log(`Actor type: ${actorType}`);

  if (actorType !== "User") {
    // GitHub Apps and other bot accounts.
    if (isAllowedBot(actor, allowedBots)) {
      console.log(
        `Actor ${actor} is in allowed_bots list, skipping human actor check`,
      );
      return;
    }
    const botName = actor.toLowerCase().replace(/\[bot\]$/, "");
    throw new Error(
      `Workflow initiated by non-human actor: ${botName} (type: ${actorType}). Add bot to allowed_bots list or use '*' to allow all bots.`,
    );
  }

  // Regular User account. allowed_bots is only for bot actors and is not
  // consulted here; write-access enforcement for users happens separately
  // in checkWritePermissions.
  console.log(`Verified human actor: ${actor}`);
}
