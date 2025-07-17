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
  const { data: userData } = await octokit.users.getByUsername({
    username: githubContext.actor,
  });

  const actorType = userData.type;

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
