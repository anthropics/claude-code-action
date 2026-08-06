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

const CREDENTIAL_HELPER_FILENAME = ".git-credential-gh-token";

type GitUser = {
  login: string;
  id: number;
};

/**
 * Path of the credential helper script written when ALLOWED_NON_WRITE_USERS is
 * set. Resolved lazily so setup and cleanup agree even though cleanup runs in a
 * separate process.
 */
export function getCredentialHelperPath(): string {
  return join(
    process.env.GITHUB_ACTION_PATH || homedir(),
    CREDENTIAL_HELPER_FILENAME,
  );
}

/**
 * The credential-free URL for the repository this action is operating on.
 */
export function buildCleanRemoteUrl(context: GitHubContext): string {
  const serverUrl = new URL(GITHUB_SERVER_URL);
  return `https://${serverUrl.host}/${context.repository.owner}/${context.repository.repo}.git`;
}

/**
 * Remove any embedded credentials from an http(s) remote URL.
 *
 * Returns null when the URL carries no credentials, or when it is not an
 * http(s) URL (ssh remotes never embed a token, so they are left alone).
 * Rewriting the URL that is actually configured, rather than rebuilding one
 * from the event context, keeps a remote that points somewhere other than the
 * event repository intact.
 */
export function stripCredentialsFromRemoteUrl(
  remoteUrl: string,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(remoteUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }

  if (!parsed.username && !parsed.password) {
    return null;
  }

  parsed.username = "";
  parsed.password = "";
  return parsed.toString();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

  if (process.env.ALLOWED_NON_WRITE_USERS) {
    // When processing content from non-write users, use a credential helper
    // instead of embedding the token in the remote URL. The helper script reads
    // from GH_TOKEN at auth time, so .git/config stays token-free. Written as a
    // file to avoid shell-escaping the helper body; placed under
    // GITHUB_ACTION_PATH so it sits alongside the action source.
    console.log("Configuring git credential helper...");
    process.env.GH_TOKEN = githubToken;
    const helperPath = getCredentialHelperPath();
    await writeFile(
      helperPath,
      '#!/bin/sh\necho username=x-access-token\necho password="$GH_TOKEN"\n',
      { mode: 0o700 },
    );
    await $`git remote set-url origin ${buildCleanRemoteUrl(context)}`;
    await $`git config credential.helper ${helperPath}`;
    console.log("✓ Configured credential helper");
  } else {
    // Update the remote URL to include the token for authentication
    console.log("Updating remote URL with authentication...");
    // Built by splicing credentials into the clean URL so both branches stay in
    // sync; avoids re-encoding the token through the URL parser.
    const remoteUrl = buildCleanRemoteUrl(context).replace(
      "https://",
      `https://x-access-token:${githubToken}@`,
    );
    await $`git remote set-url origin ${remoteUrl}`;
    console.log("✓ Updated remote URL with authentication token");
  }

  console.log("Git authentication configured successfully");
}

/**
 * Undo the authentication configured by configureGitAuth.
 *
 * The app installation token is revoked when the action finishes, so anything
 * left pointing at it breaks later git operations in the same job, including a
 * second invocation of this action, whose tag-mode branch setup fetches before
 * configuring its own auth. Restores a credential-free origin URL, drops the
 * credential helper, and deletes the helper script.
 *
 * Never throws: cleanup runs in an always() step and must not fail the job.
 */
export async function cleanupGitAuth(): Promise<void> {
  // Restore a credential-free origin URL.
  try {
    const originUrl = (
      await $`git remote get-url origin`.quiet().text()
    ).trim();
    const cleanedUrl = stripCredentialsFromRemoteUrl(originUrl);
    if (cleanedUrl && cleanedUrl !== originUrl) {
      await $`git remote set-url origin ${cleanedUrl}`.quiet();
      console.log("✓ Removed embedded credentials from origin remote URL");
    }
  } catch {
    // No git repository or no origin remote; nothing to restore.
  }

  const helperPath = getCredentialHelperPath();

  // Drop only the helper this action configured, leaving any other helper
  // (for example one set by the workflow itself) untouched. Scoped to the
  // repository config, which is where configureGitAuth writes it.
  try {
    const configured = (
      await $`git config --local --get-all credential.helper`.quiet().text()
    ).trim();
    if (configured.split("\n").some((value) => value.trim() === helperPath)) {
      await $`git config --local --unset-all credential.helper ${`^${escapeRegExp(helperPath)}$`}`.quiet();
      console.log("✓ Removed git credential helper");
    }
  } catch {
    // No credential helper configured.
  }

  try {
    await rm(helperPath, { force: true });
  } catch {
    // Helper script was never written.
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
