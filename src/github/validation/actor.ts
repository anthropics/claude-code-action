#!/usr/bin/env bun

/**
 * Check if the action trigger is from a human actor
 * Prevents automated tools or bots from triggering Claude
 */

import * as core from "@actions/core";
import type { Octokit } from "@octokit/rest";
import type { ParsedGitHubContext } from "../context";

/**
 * Get the GitHub actor type (User, Bot, Organization, etc.)
 */
async function getActorType(
  octokit: Octokit,
  actor: string,
): Promise<string | null> {
  try {
    const { data } = await octokit.users.getByUsername({ username: actor });
    return data.type;
  } catch (error) {
    core.warning(`Failed to get user data for ${actor}: ${error}`);
    return null;
  }
}

export async function checkHumanActor(
  octokit: Octokit,
  githubContext: ParsedGitHubContext,
) {
  const actorType = await getActorType(octokit, githubContext.actor);

  if (!actorType) {
    throw new Error(
      `Could not determine actor type for: ${githubContext.actor}`,
    );
  }

  console.log(`Actor type: ${actorType}`);

  if (githubContext.inputs.allowBotActor && actorType === "Bot") {
    console.log(
      `Bot actor allowed, skipping human actor check for: ${githubContext.actor}`,
    );
    return;
  }

  if (actorType !== "User") {
    throw new Error(
      `Workflow initiated by non-human actor: ${githubContext.actor} (type: ${actorType}).`,
    );
  }

  console.log(`Verified human actor: ${githubContext.actor}`);
}
