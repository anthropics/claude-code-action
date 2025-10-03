#!/usr/bin/env bun

/**
 * Configure git authentication for non-signing mode
 * Sets up git user and authentication to work with GitHub App tokens
 */

import { $ } from "bun";
import type { GitHubContext } from "../context";
import { GITHUB_SERVER_URL } from "../api/config";

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
