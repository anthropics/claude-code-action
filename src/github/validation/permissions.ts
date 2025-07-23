import * as core from "@actions/core";
import type { ParsedGitHubContext } from "../context";
import type { Octokit } from "@octokit/rest";

/**
 * Return the GitHub user type (User, Bot, Organization, ...)
 * @param octokit - The Octokit REST client
 * @param actor - The GitHub actor username
 * @returns The actor type string or null if unable to determine
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

/**
 * Try to perform a real write operation test for GitHub App tokens
 * This is more reliable than checking repo.permissions.push (always false for App tokens)
 * @param octokit - The Octokit REST client
 * @param context - The GitHub context
 * @returns true if write access is confirmed, false otherwise
 */
async function testWriteAccess(
  octokit: Octokit,
  context: ParsedGitHubContext,
): Promise<boolean> {
  try {
    const { data: repo } = await octokit.repos.get({
      owner: context.repository.owner,
      repo: context.repository.repo,
    });

    // For App tokens, repo.permissions.push is always false, so we can't rely on it
    // Instead, let's try a write operation that would fail if we don't have write access
    try {
      const { data: defaultBranchRef } = await octokit.git.getRef({
        owner: context.repository.owner,
        repo: context.repository.repo,
        ref: `heads/${repo.default_branch}`,
      });

      core.info(
        `Successfully accessed default branch ref: ${defaultBranchRef.ref}`,
      );

      return true;
    } catch (refError) {
      core.warning(`Could not access git refs: ${refError}`);
      return false;
    }
  } catch (error) {
    core.warning(`Failed to test write access: ${error}`);
    return false;
  }
}

/**
 * Check GitHub App installation permissions by trying the installation endpoint
 * This may work with installation tokens in some cases
 * @param octokit - The Octokit REST client
 * @param context - The GitHub context
 * @returns true if the app has write permissions via installation, false otherwise
 */
async function checkAppInstallationPermissions(
  octokit: Octokit,
  context: ParsedGitHubContext,
): Promise<boolean> {
  try {
    // Try to get the installation for this repository
    // Note: This might fail if called with an installation token instead of JWT
    const { data: installation } = await octokit.apps.getRepoInstallation({
      owner: context.repository.owner,
      repo: context.repository.repo,
    });

    core.info(`App installation found: ${installation.id}`);

    const permissions = installation.permissions || {};
    const hasWrite =
      permissions.contents === "write" || permissions.contents === "admin";

    core.info(
      `App installation permissions → contents:${permissions.contents}`,
    );
    if (hasWrite) {
      core.info("App has write-level access via installation permissions");
    } else {
      core.warning("App lacks write-level access via installation permissions");
    }

    return hasWrite;
  } catch (error) {
    core.warning(
      `Failed to check app installation permissions (may require JWT): ${error}`,
    );
    return false;
  }
}

/**
 * Determine whether the supplied token grants **write‑level** access to the target repository.
 *
 * For GitHub Apps, we use multiple approaches since repo.permissions.push is unreliable.
 * For human users, we check collaborator permissions.
 * @param octokit - The Octokit REST client
 * @param context - The GitHub context
 * @returns true if the actor has write permissions, false otherwise
 */
export async function checkWritePermissions(
  octokit: Octokit,
  context: ParsedGitHubContext,
): Promise<boolean> {
  const { repository, actor } = context;

  core.info(`Checking write permissions for actor: ${actor}`);

  // 1. Get actor type to determine approach
  const actorType = await getActorType(octokit, actor);

  // 2. For GitHub Apps/Bots, use multiple approaches
  if (actorType === "Bot") {
    core.info(
      `GitHub App detected: ${actor}, checking permissions via multiple methods`,
    );

    // Method 1: Try installation permissions check (may fail with installation tokens)
    const hasInstallationAccess = await checkAppInstallationPermissions(
      octokit,
      context,
    );
    if (hasInstallationAccess) {
      return true;
    }

    // Method 2: Check if bot is a direct collaborator
    try {
      const { data } = await octokit.repos.getCollaboratorPermissionLevel({
        owner: repository.owner,
        repo: repository.repo,
        username: actor,
      });

      const level = data.permission;
      core.info(`App collaborator permission level: ${level}`);
      const hasCollaboratorAccess = level === "admin" || level === "write";

      if (hasCollaboratorAccess) {
        core.info(`App has write access via collaborator: ${level}`);
        return true;
      }
    } catch (error) {
      core.warning(
        `Could not check collaborator permissions for bot: ${error}`,
      );
    }

    // Method 3: Test actual write access capability
    const hasWriteAccess = await testWriteAccess(octokit, context);
    if (hasWriteAccess) {
      core.info("App has write access based on capability test");
      return true;
    }
    core.warning(`Bot lacks write permissions based on all checks`);
    return false;
  }

  // 3. For human users, check collaborator permission level
  try {
    const { data } = await octokit.repos.getCollaboratorPermissionLevel({
      owner: repository.owner,
      repo: repository.repo,
      username: actor,
    });

    const level = data.permission;
    core.info(`Human collaborator permission level: ${level}`);
    const hasWrite = level === "admin" || level === "write";

    if (hasWrite) {
      core.info(`Human has write access: ${level}`);
    } else {
      core.warning(`Human has insufficient permissions: ${level}`);
    }

    return hasWrite;
  } catch (error) {
    core.warning(`Unable to fetch collaborator level for ${actor}: ${error}`);

    return false;
  }
}
