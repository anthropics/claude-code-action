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

  // Remove the authorization header that actions/checkout sets
  console.log("Removing existing git authentication headers...");
  try {
    await $`git config --unset-all http.${GITHUB_SERVER_URL}/.extraheader`;
    console.log("✓ Removed existing authentication headers");
  } catch (e) {
    console.log("No existing authentication headers to remove");
  }

  // Update the remote URL to include the token for authentication
  console.log("Updating remote URL with authentication...");
  const remoteUrl = `https://x-access-token:${githubToken}@${serverUrl.host}/${context.repository.owner}/${context.repository.repo}.git`;
  await $`git remote set-url origin ${remoteUrl}`;
  console.log("✓ Updated remote URL with authentication token");

  console.log("Git authentication configured successfully");
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
