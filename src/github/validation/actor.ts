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
  allowBotUsers: boolean,
) {
  // Fetch user information from GitHub API
  const { data: userData } = await octokit.users.getByUsername({
    username: githubContext.actor,
  });

  const actorType = userData.type;

  console.log(`Actor type: ${actorType}`);

  // Skip check if bot users are allowed
  if (allowBotUsers && actorType === "Bot") {
    console.log(
      `Bot users are allowed, skipping human actor check for: ${githubContext.actor}`,
    );
    return;
  }

  if (actorType !== "User") {
    throw new Error(
      `Workflow initiated by non-human actor: ${githubContext.actor} (type: ${actorType}). Set allow_bot_users: true to enable bot users.`,
    );
  }

  console.log(`Verified human actor: ${githubContext.actor}`);
}
