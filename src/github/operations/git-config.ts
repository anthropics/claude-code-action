#!/usr/bin/env bun

/**
 * Configure git authentication for non-signing mode
 * Sets up git user and authentication to work with GitHub App tokens
 */

import { $ } from "bun";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import type { GitHubContext } from "../context";
import { GITHUB_SERVER_URL } from "../api/config";

const SSH_SIGNING_KEY_PATH = join(homedir(), ".ssh", "claude_signing_key");

type GitUser = {
  login: string;
  id: number;
};

export async function configureGitAuth(
  githubToken: string,
  context: GitHubContext,
  user: GitUser,
) {
  console.log("Configuring git authentication for non-signing mode");

  // Determine the noreply email domain based on GITHUB_SERVER_URL
  const serverUrl = new URL(GITHUB_SERVER_URL);
  const noreplyDomain =
    serverUrl.hostname === "github.com"
      ? "users.noreply.github.com"
      : `users.noreply.${serverUrl.hostname}`;

  // Configure git user
  console.log("Configuring git user...");
  const botName = user.login;
  const botId = user.id;
  console.log(`Setting git user as ${botName}...`);
  await $`git config user.name "${botName}"`;
  await $`git config user.email "${botId}+${botName}@${noreplyDomain}"`;
  console.log(`✓ Set git user as ${botName}`);

  await replaceCheckoutCredentials(githubToken, context);

  console.log("Git authentication configured successfully");
}

/**
 * Replace the credential that actions/checkout persisted in the working tree.
 *
 * actions/checkout stores its token as an `http.<server>/.extraheader` entry
 * in .git/config for the duration of the job. Claude and the tools it invokes
 * run inside this working tree, so remove that entry and back git with the
 * action's own token instead (a credential helper when non-write users or bots
 * are allowed, otherwise the origin URL). This applies to every mode, including API
 * commit signing where no other git configuration is needed.
 *
 * actions/checkout < v6 stored the header directly in the repo-local config,
 * where `git config --unset-all` removes it. Since v6.0.0 (backported to
 * v5.0.1 and v4.3.1) the header is written to a separate file under
 * RUNNER_TEMP that the repo config pulls in via `include.path`; `--unset-all`
 * on the local config cannot touch an include-provided value, so the removal
 * was a silent no-op and the checkout credential (typically the workflow
 * GITHUB_TOKEN) stayed usable by git for the rest of the job. Clear the
 * header from the local config AND from every included file so it can no
 * longer authenticate while Claude runs.
 */
export async function replaceCheckoutCredentials(
  githubToken: string,
  context: GitHubContext,
) {
  const serverUrl = new URL(GITHUB_SERVER_URL);

  // Remove the authorization header that actions/checkout sets
  console.log("Removing existing git authentication headers...");
  const extraheaderKey = `http.${GITHUB_SERVER_URL}/.extraheader`;
  let removedHeader = false;
  try {
    await $`git config --unset-all ${extraheaderKey}`;
    removedHeader = true;
  } catch {
    // No extraheader in the local config (expected on the v6+ include layout).
  }
  try {
    const includePaths =
      await $`git config --local --get-all include.path`.text();
    for (const includePath of includePaths.split("\n")) {
      const path = includePath.trim();
      if (!path) continue;
      try {
        await $`git config --file ${path} --unset-all ${extraheaderKey}`;
        removedHeader = true;
      } catch {
        // This include does not define the header; leave it untouched.
      }
    }
  } catch {
    // No include.path entries in the local config.
  }
  console.log(
    removedHeader
      ? "✓ Removed existing authentication headers"
      : "No existing authentication headers to remove",
  );

  if (process.env.ALLOWED_NON_WRITE_USERS || context.inputs.allowedBots) {
    // When processing content from non-write users, use a credential helper
    // instead of embedding the token in the remote URL. Allowed bots count too:
    // their access isn't checked, and they relay text that other people wrote.
    // The helper script reads
    // from GH_TOKEN at auth time, so .git/config stays token-free. Written as a
    // file to avoid shell-escaping the helper body; placed under
    // GITHUB_ACTION_PATH so it sits alongside the action source.
    console.log("Configuring git credential helper...");
    process.env.GH_TOKEN = githubToken;
    const helperPath = join(
      process.env.GITHUB_ACTION_PATH || homedir(),
      ".git-credential-gh-token",
    );
    // With no token it answers nothing, so that git goes on to a later step's own
    // credentials. An empty password would count as an answer.
    await writeFile(
      helperPath,
      '#!/bin/sh\n[ -n "$GH_TOKEN" ] || exit 0\necho username=x-access-token\necho password="$GH_TOKEN"\n',
      { mode: 0o700 },
    );
    // The username holds no secret. It keeps the URL out of rewrite rules on the
    // server's prefix, as the token URL below is, and they would bypass the helper.
    const helperUrl = `https://x-access-token@${serverUrl.host}/${context.repository.owner}/${context.repository.repo}.git`;
    await $`git remote set-url origin ${helperUrl}`;
    // git runs the helper through sh, which would strip Windows backslashes and split
    // a path with a space.
    const shellSafePath = helperPath
      .replaceAll("\\", "/")
      .replaceAll("'", "'\\''");
    // Only for this server: git asks a helper about every host it contacts, and the
    // helper answers without looking at which one.
    const helperKey = `credential.https://${serverUrl.host}.helper`;
    await $`git config ${helperKey} ${`!'${shellSafePath}'`}`;
    console.log("✓ Configured credential helper");
    console.log(
      "Later steps that use the origin remote need their own credentials: GH_TOKEN, GIT_ASKPASS, a credential saved for the username x-access-token, or their own remote URL",
    );
  } else {
    // Update the remote URL to include the token for authentication
    console.log("Updating remote URL with authentication...");
    const remoteUrl = `https://x-access-token:${githubToken}@${serverUrl.host}/${context.repository.owner}/${context.repository.repo}.git`;
    await $`git remote set-url origin ${remoteUrl}`;
    console.log("✓ Updated remote URL with authentication token");
  }
}

/**
 * Configure git to use SSH signing for commits
 * This is an alternative to GitHub API-based commit signing (use_commit_signing)
 */
export async function setupSshSigning(sshSigningKey: string): Promise<void> {
  console.log("Configuring SSH signing for commits...");

  // Validate SSH key format
  if (!sshSigningKey.trim()) {
    throw new Error("SSH signing key cannot be empty");
  }
  if (
    !sshSigningKey.includes("BEGIN") ||
    !sshSigningKey.includes("PRIVATE KEY")
  ) {
    throw new Error("Invalid SSH private key format");
  }

  // Create .ssh directory with secure permissions (700)
  const sshDir = join(homedir(), ".ssh");
  await mkdir(sshDir, { recursive: true, mode: 0o700 });

  // Ensure key ends with newline (required for ssh-keygen to parse it)
  const normalizedKey = sshSigningKey.endsWith("\n")
    ? sshSigningKey
    : sshSigningKey + "\n";

  // Write the signing key atomically with secure permissions (600)
  await writeFile(SSH_SIGNING_KEY_PATH, normalizedKey, { mode: 0o600 });
  console.log(`✓ SSH signing key written to ${SSH_SIGNING_KEY_PATH}`);

  // Configure git to use SSH signing
  await $`git config gpg.format ssh`;
  await $`git config user.signingkey ${SSH_SIGNING_KEY_PATH}`;
  await $`git config commit.gpgsign true`;

  console.log("✓ Git configured to use SSH signing for commits");
}

/**
 * Clean up the SSH signing key file
 * Should be called in the post step for security
 */
export async function cleanupSshSigning(): Promise<void> {
  try {
    await rm(SSH_SIGNING_KEY_PATH, { force: true });
    console.log("✓ SSH signing key cleaned up");
  } catch (error) {
    console.log("No SSH signing key to clean up");
  }
}
