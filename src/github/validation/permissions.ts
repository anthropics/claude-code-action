import * as core from "@actions/core";
import type { ParsedGitHubContext } from "../context";
import type { Octokit } from "@octokit/rest";

/**
 * Check if the actor has write permissions to the repository
 * @param octokit - The Octokit REST client
 * @param context - The GitHub context
 * @returns true if the actor has write permissions, false otherwise
 */
async function getBotActorType(
  octokit: Octokit,
  actor: string,
): Promise<string | null> {
  try {
    const { data: userData } = await octokit.users.getByUsername({
      username: actor,
    });
    return userData.type;
  } catch (error) {
    core.warning(`Failed to get user data for ${actor}: ${error}`);
    return null;
  }
}

export async function checkWritePermissions(
  octokit: Octokit,
  context: ParsedGitHubContext,
): Promise<boolean> {
  const { repository, actor } = context;

  try {
    core.info(`Checking permissions for actor: ${actor}`);

    const actorType = await getBotActorType(octokit, actor);

    if (actorType === "Bot") {
      core.info(`GitHub App detected: ${actor}, checking write permissions`);

      try {
        const response = await octokit.repos.getCollaboratorPermissionLevel({
          owner: repository.owner,
          repo: repository.repo,
          username: actor,
        });

        const permissionLevel = response.data.permission;
        core.info(`App permission level: ${permissionLevel}`);

        if (permissionLevel === "admin" || permissionLevel === "write") {
          core.info(`App has write access: ${permissionLevel}`);
          return true;
        } else {
          core.warning(`App has insufficient permissions: ${permissionLevel}`);
          return false;
        }
      } catch (error) {
        core.warning(
          `Could not check collaborator permissions for bot, checking app installation: ${error}`,
        );

        try {
          const installation = await octokit.apps.getRepoInstallation({
            owner: repository.owner,
            repo: repository.repo,
          });

          core.info(`App installation found: ${installation.data.id}`);

          const permissions = installation.data.permissions;
          if (
            permissions &&
            (permissions.contents === "write" ||
              permissions.contents === "admin")
          ) {
            core.info(`App has write permissions via installation`);
            return true;
          } else {
            core.warning(`App lacks write permissions in installation`);
            return false;
          }
        } catch (installationError) {
          core.warning(`App lacks repository access: ${installationError}`);
          return false;
        }
      }
    }

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
