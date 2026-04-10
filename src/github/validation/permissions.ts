import * as core from "@actions/core";
import type { ParsedGitHubContext } from "../context";
import type { Octokit } from "@octokit/rest";

/**
 * Check if a bot actor is in the allowed bots list.
 */
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

/**
 * Check if the actor has write permissions to the repository
 * @param octokit - The Octokit REST client
 * @param context - The GitHub context
 * @param allowedNonWriteUsers - Comma-separated list of users allowed without write permissions, or '*' for all
 * @param githubTokenProvided - Whether github_token was provided as input (not from app)
 * @returns true if the actor has write permissions, false otherwise
 */
export async function checkWritePermissions(
  octokit: Octokit,
  context: ParsedGitHubContext,
  allowedNonWriteUsers?: string,
  githubTokenProvided?: boolean,
): Promise<boolean> {
  const { repository, actor } = context;
  const allowedBots = context.inputs.allowedBots ?? "";

  try {
    core.info(`Checking permissions for actor: ${actor}`);

    // Check if we should bypass permission checks for this user
    if (allowedNonWriteUsers && githubTokenProvided) {
      const allowedUsers = allowedNonWriteUsers.trim();
      if (allowedUsers === "*") {
        core.warning(
          `⚠️ SECURITY WARNING: Bypassing write permission check for ${actor} due to allowed_non_write_users='*'. This should only be used for workflows with very limited permissions.`,
        );
        return true;
      } else if (allowedUsers) {
        const allowedUserList = allowedUsers
          .split(",")
          .map((u) => u.trim())
          .filter((u) => u.length > 0);
        if (allowedUserList.includes(actor)) {
          core.warning(
            `⚠️ SECURITY WARNING: Bypassing write permission check for ${actor} due to allowed_non_write_users configuration. This should only be used for workflows with very limited permissions.`,
          );
          return true;
        }
      }
    }

    // Check if the actor is a GitHub App (bot user with [bot] suffix)
    if (actor.endsWith("[bot]")) {
      core.info(`Actor is a GitHub App: ${actor}`);
      return true;
    }

    // Check if the actor is in the allowed bots list (handles non-[bot] actors
    // like GitHub Copilot whose GITHUB_ACTOR is "Copilot", not "Copilot[bot]")
    if (isAllowedBot(actor, allowedBots)) {
      core.info(
        `Actor ${actor} is in allowed_bots list, skipping permission check`,
      );
      return true;
    }

    // Check permissions directly using the permission endpoint
    const response = await octokit.repos.getCollaboratorPermissionLevel({
      owner: repository.owner,
      repo: repository.repo,
      username: actor,
    });

    const permissionLevel = response.data.permission;
    core.info(`Permission level retrieved: ${permissionLevel}`);

    if (permissionLevel === "admin" || permissionLevel === "write") {
      core.info(`Actor has write access: ${permissionLevel}`);
      return true;
    } else {
      core.warning(`Actor has insufficient permissions: ${permissionLevel}`);
      return false;
    }
  } catch (error) {
    // Handle 404 errors for non-user actors (e.g. GitHub Apps like Copilot
    // whose GITHUB_ACTOR doesn't end with [bot]).
    // The collaborator permission API only works for user accounts.
    if (
      error instanceof Error &&
      error.message.includes("is not a user")
    ) {
      core.info(
        `Actor ${actor} is not a GitHub user (likely a GitHub App). Checking allowed_bots...`,
      );
      if (isAllowedBot(actor, allowedBots)) {
        core.info(
          `Non-user actor ${actor} is in allowed_bots list, granting access`,
        );
        return true;
      }
      core.warning(
        `Non-user actor ${actor} is not in allowed_bots list. Add it to allowed_bots or use '*' to allow all bots.`,
      );
      return false;
    }

    core.error(`Failed to check permissions: ${error}`);
    throw new Error(`Failed to check permissions for ${actor}: ${error}`);
  }
}
