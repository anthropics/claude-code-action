#!/usr/bin/env bun

/**
 * Check if the action trigger is from a human actor
 * Prevents automated tools or bots from triggering Claude
 */

import type { Octokit } from "@octokit/rest";
import type { ParsedGitHubContext } from "../context";

export async function checkHumanActor(
  octokit: Octokit,
  githubContext: ParsedGitHubContext,
) {
  // Fetch user information from GitHub API
  const { data: userData } = await octokit.users.getByUsername({
    username: githubContext.actor,
  });

  const actorType = userData.type;

  console.log(`Actor type: ${actorType}`);

  // Check bot permissions if actor is not a User
  if (actorType !== "User") {
    const allowedBots = githubContext.inputs.allowedBots;

    // Parse allowed bots list
    const allowedBotsList = allowedBots
      .split(",")
      .map((bot) => bot.trim().toLowerCase())
      .filter((bot) => bot.length > 0);

    // Check if all bots are allowed
    if (allowedBots.trim() === "*") {
      console.log(
        `All bots are allowed, skipping human actor check for: ${githubContext.actor}`,
      );
      return;
    }

    // Check if specific bot is allowed
    if (allowedBotsList.includes(githubContext.actor.toLowerCase())) {
      console.log(
        `Bot ${githubContext.actor} is in allowed list, skipping human actor check`,
      );
      return;
    }

    // Bot not allowed
    throw new Error(
      `Workflow initiated by non-human actor: ${githubContext.actor} (type: ${actorType}). Add bot to allowed_bots list or use '*' to allow all bots.`,
    );
  }

  console.log(`Verified human actor: ${githubContext.actor}`);
}
