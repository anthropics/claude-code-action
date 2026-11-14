import * as core from "@actions/core";
import {
  isPullRequestEvent,
  isWorkflowRunEvent,
  type GitHubContext,
} from "../context";
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
 * Collect the actors whose repository access should be checked. This is
 * normally just the workflow actor (GITHUB_ACTOR). For workflow_run events
 * the actor that started the upstream run is checked as well when it
 * differs, since that is the account the run originates from. GitHub credits a
 * run to whoever caused it, so a maintainer reopening a fork's pull request
 * starts a run of the fork's code; the fork's owner is checked too.
 *
 * Returns null when the run's origin cannot be determined.
 */
function getActorsToCheck(context: GitHubContext): string[] | null {
  const actors = [context.actor];

  if (isWorkflowRunEvent(context)) {
    const run = context.payload.workflow_run;
    const runActor = run?.actor?.login;
    if (runActor && !actors.includes(runActor)) {
      core.info(
        `workflow_run was started by ${runActor}; checking permissions for that actor as well`,
      );
      actors.push(runActor);
    }

    const headRepository = run?.head_repository;
    if (!headRepository?.full_name) {
      core.warning("workflow_run does not say which repository it ran from");
      return null;
    }
    const isFork =
      headRepository.full_name.toLowerCase() !==
      context.repository.full_name.toLowerCase();
    const forkOwner = headRepository.full_name.split("/")[0]!;
    if (isFork && !actors.includes(forkOwner)) {
      core.info(
        `workflow_run ran code from a fork owned by ${forkOwner}; checking permissions for that account as well`,
      );
      actors.push(forkOwner);
    }
  }

  return actors;
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
  context: GitHubContext,
  allowedNonWriteUsers?: string,
  githubTokenProvided?: boolean,
): Promise<boolean> {
  const actors = getActorsToCheck(context);
  if (!actors) return false;

  for (const actor of actors) {
    const allowed = await checkActorWritePermissions(
      octokit,
      context,
      actor,
      allowedNonWriteUsers,
      githubTokenProvided,
    );
    if (!allowed) return false;
  }

  return true;
}

/**
 * When a bot acts on a pull request, the bot is the actor even though someone
 * else wrote the pull request. Bots are not checked for repository access, so an
 * allowed bot acting on an outsider's fork would otherwise start a run for them.
 * Call this once a run is going to start, so that bot activity with nothing to
 * do still skips quietly.
 */
export async function checkBotActorPullRequestAuthor(
  octokit: Octokit,
  context: GitHubContext,
  allowedNonWriteUsers?: string,
  githubTokenProvided?: boolean,
): Promise<boolean> {
  if (!isPullRequestEvent(context) || !context.actor.endsWith("[bot]")) {
    return true;
  }
  const author = context.payload.pull_request.user?.login;
  // A bot's own pull request is left to the check that bots are allowed.
  if (author === context.actor) return true;

  let allowed = false;
  if (author?.endsWith("[bot]")) {
    allowed = isAllowedBot(author, context.inputs.allowedBots ?? "");
  } else if (author) {
    allowed = await checkActorWritePermissions(
      octokit,
      context,
      author,
      allowedNonWriteUsers,
      githubTokenProvided,
    );
  }
  if (!allowed) {
    core.warning(
      `${context.actor} acted on a pull request by ${author ?? "an unknown author"}, who is not allowed to start a run`,
    );
  }
  return allowed;
}

async function checkActorWritePermissions(
  octokit: Octokit,
  context: GitHubContext,
  actor: string,
  allowedNonWriteUsers?: string,
  githubTokenProvided?: boolean,
): Promise<boolean> {
  const { repository } = context;
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

    // Check if the actor is a GitHub App (bot user with [bot] suffix).
    // Usernames cannot contain "[" or "]", so the suffix is a reliable
    // bot signal that doesn't require an API lookup.
    if (actor.endsWith("[bot]")) {
      core.info(`Actor is a GitHub App: ${actor}`);
      return true;
    }

    // For all other actors, resolve the account via the collaborator
    // permission endpoint. allowed_bots is only consulted in the catch
    // block below, after the API has confirmed the actor is not a regular
    // user account (e.g. GitHub Apps like Copilot whose GITHUB_ACTOR is
    // "Copilot" rather than "Copilot[bot]").
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
    if (error instanceof Error && error.message.includes("is not a user")) {
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
