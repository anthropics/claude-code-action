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

  // Check allowed_bots BEFORE calling the GitHub Users API.
  // Some bot actors (e.g. GitHub Copilot with GITHUB_ACTOR="Copilot") are
  // not resolvable via the Users API and would cause a 404 if we called it
  // first.  By checking the allow-list early we avoid the unnecessary API
  // call and the resulting crash.
  if (isAllowedBot(githubContext.actor, allowedBots)) {
    console.log(
      `Actor ${githubContext.actor} is in allowed_bots list, skipping human actor check`,
    );
    return;
  }

  // Fetch user information from GitHub API
  let actorType: string;
  try {
    const { data: userData } = await octokit.users.getByUsername({
      username: githubContext.actor,
    });
    actorType = userData.type;
  } catch (error) {
    // Handle 404 for non-user actors (GitHub Apps whose GITHUB_ACTOR
    // doesn't match any user account, e.g. "Copilot").
    if (
      error instanceof Error &&
      (error.message.includes("Not Found") ||
        error.message.includes("is not a user"))
    ) {
      const botName = githubContext.actor.toLowerCase().replace(/\[bot\]$/, "");
      throw new Error(
        `Workflow initiated by non-human actor: ${botName} (actor not found on GitHub). Add bot to allowed_bots list or use '*' to allow all bots.`,
      );
    }
    throw error;
  }

  console.log(`Actor type: ${actorType}`);

  // Check bot permissions if actor is not a User
  if (actorType !== "User") {
    const botName = githubContext.actor.toLowerCase().replace(/\[bot\]$/, "");

    // Bot not allowed (we already checked allowed_bots above)
    throw new Error(
      `Workflow initiated by non-human actor: ${botName} (type: ${actorType}). Add bot to allowed_bots list or use '*' to allow all bots.`,
    );
  }

  console.log(`Verified human actor: ${githubContext.actor}`);
}
