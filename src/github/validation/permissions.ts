import * as core from "@actions/core";
import type { ParsedGitHubContext } from "../context";
import type { Octokit } from "@octokit/rest";

/**
 * Normalize a bot name for comparison: lowercase and strip the "[bot]" suffix.
 * Matches the normalization used in checkHumanActor.
 */
function normalizeBotName(name: string): string {
  return name.toLowerCase().replace(/\[bot\]$/, "");
}

/**
 * Check if the actor is in the allowed_bots list.
 * Handles wildcard "*" and comma-separated bot name lists.
 * Names are normalized: case-insensitive and "[bot]" suffix is ignored.
 */
export function isActorInAllowedBots(
  actor: string,
  allowedBots: string,
): boolean {
  const trimmed = allowedBots.trim();
  if (!trimmed) return false;
  if (trimmed === "*") return true;
  const actorName = normalizeBotName(actor);
  const allowedList = trimmed
    .split(",")
    .map((b) => normalizeBotName(b.trim()))
    .filter((b) => b.length > 0);
  return allowedList.includes(actorName);
}

/**
 * Check if the actor has write permissions to the repository
 * @param octokit - The Octokit REST client
 * @param context - The GitHub context
 * @param allowedNonWriteUsers - Comma-separated list of users allowed without write permissions, or '*' for all
 * @param githubTokenProvided - Whether github_token was provided as input (not from app)
 * @param allowedBots - Comma-separated list of bot usernames allowed to bypass the permission check, or '*' for all bots
 * @returns true if the actor has write permissions, false otherwise
 */
export async function checkWritePermissions(
  octokit: Octokit,
  context: ParsedGitHubContext,
  allowedNonWriteUsers?: string,
  githubTokenProvided?: boolean,
  allowedBots?: string,
): Promise<boolean> {
  const { repository, actor } = context;

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

    // Check if the actor is a GitHub App (bot user) by [bot] suffix
    if (actor.endsWith("[bot]")) {
      core.info(`Actor is a GitHub App: ${actor}`);
      return true;
    }

    // Check if the actor is in the allowed_bots list.
    // Some bots (e.g. Copilot, renovate) do not have a "[bot]" suffix in their
    // login but are still bot-type accounts. When a repo owner explicitly lists
    // them in allowed_bots, we bypass the collaborators API call — the API
    // returns 404 for bot accounts that are not repository collaborators.
    if (allowedBots && isActorInAllowedBots(actor, allowedBots)) {
      if (allowedBots.trim() === "*") {
        core.warning(
          `⚠️ SECURITY WARNING: Bypassing write permission check for ${actor} due to allowed_bots='*'. Ensure your workflow triggers are appropriately scoped.`,
        );
      } else {
        core.info(
          `Actor ${actor} is in allowed_bots list, bypassing permission check`,
        );
      }
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
    core.error(`Failed to check permissions: ${error}`);
    throw new Error(`Failed to check permissions for ${actor}: ${error}`);
  }
}
