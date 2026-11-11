import * as core from "@actions/core";
import type { Octokit } from "@octokit/rest";
import { parseAllowedTools } from "../../modes/agent/parse-tools";
import { retryWithBackoff } from "../../utils/retry";
import type { ParsedGitHubContext } from "../context";

/**
 * Commands that commonly execute code from the checkout: package scripts, test
 * files, build files and config loaded by interpreters. On a pull request from
 * an author without write access that code is attacker-controlled, while the
 * session holds the job's tokens. Deny rules take precedence over allow rules,
 * so these stay blocked even when claude_args allows them.
 *
 * The list cannot cover every command, for example a repository's own scripts.
 * Rules in claude_args that this list does not cover are logged as a warning.
 * Every entry has the form Bash(<command>:*), which isDenied relies on.
 */
export const UNTRUSTED_PR_DISALLOWED_TOOLS = [
  // JavaScript
  "Bash(bun:*)",
  "Bash(bunx:*)",
  "Bash(deno:*)",
  "Bash(jest:*)",
  "Bash(node:*)",
  "Bash(npm:*)",
  "Bash(npx:*)",
  "Bash(pnpm:*)",
  "Bash(ts-node:*)",
  "Bash(tsx:*)",
  "Bash(vitest:*)",
  "Bash(yarn:*)",
  // Python
  "Bash(hatch:*)",
  "Bash(nox:*)",
  "Bash(pip:*)",
  "Bash(pip3:*)",
  "Bash(pipenv:*)",
  "Bash(poetry:*)",
  "Bash(pytest:*)",
  "Bash(python:*)",
  "Bash(python3:*)",
  "Bash(tox:*)",
  "Bash(uv:*)",
  "Bash(uvx:*)",
  // Other languages and build tools
  "Bash(bundle:*)",
  "Bash(cargo:*)",
  "Bash(cmake:*)",
  "Bash(composer:*)",
  "Bash(docker:*)",
  "Bash(dotnet:*)",
  "Bash(go:*)",
  "Bash(gradle:*)",
  "Bash(./gradlew:*)",
  "Bash(java:*)",
  "Bash(just:*)",
  "Bash(make:*)",
  "Bash(mvn:*)",
  "Bash(./mvnw:*)",
  "Bash(perl:*)",
  "Bash(php:*)",
  "Bash(rake:*)",
  "Bash(rspec:*)",
  "Bash(ruby:*)",
  "Bash(task:*)",
  // Shells
  "Bash(bash:*)",
  "Bash(dash:*)",
  "Bash(sh:*)",
  "Bash(zsh:*)",
  // The simplest ways to point git at a program. Other git commands can still
  // run programs, so a broad rule like Bash(git:*) stays unsafe and is warned about.
  "Bash(git config:*)",
  "Bash(git -c:*)",
];

function getPrAuthor(context: ParsedGitHubContext): string | undefined {
  const { payload } = context;
  if ("pull_request" in payload) {
    return payload.pull_request.user?.login;
  }
  // On issue_comment events a pull request arrives as an issue, whose user is
  // the pull request's author.
  if ("issue" in payload) {
    return payload.issue.user?.login;
  }
  return undefined;
}

/**
 * Whether the pull request's author has write access to the repository. This
 * is about who wrote the code, not who triggered the run, so it is deliberately
 * stricter than checkWritePermissions: bots are not trusted, allowed_bots and
 * allowed_non_write_users do not apply, and any failure counts as untrusted.
 */
async function isPrAuthorTrusted(
  octokit: Octokit,
  context: ParsedGitHubContext,
): Promise<boolean> {
  const author = getPrAuthor(context);
  if (!author || author.endsWith("[bot]")) {
    return false;
  }

  try {
    const response = await retryWithBackoff(
      () =>
        octokit.repos.getCollaboratorPermissionLevel({
          owner: context.repository.owner,
          repo: context.repository.repo,
          username: author,
        }),
      {
        initialDelayMs: 1000,
        // A 404 (not a user account) or 403 won't change on a retry.
        shouldRetry: (error) => {
          const { status } = error as Error & { status?: number };
          return status === undefined || status === 429 || status >= 500;
        },
      },
    );
    const { permission } = response.data;
    return permission === "admin" || permission === "write";
  } catch (error) {
    core.warning(
      `Could not check repository access for pull request author ${author}, treating them as untrusted: ${error}`,
    );
    return false;
  }
}

/** Whether a Bash allow rule only permits commands that the deny list blocks. */
function isDenied(rule: string): boolean {
  const command = rule.slice("Bash(".length, -")".length);
  return UNTRUSTED_PR_DISALLOWED_TOOLS.some((denied) => {
    const prefix = denied.slice("Bash(".length, -":*)".length);
    return (
      command === prefix ||
      command.startsWith(`${prefix} `) ||
      command.startsWith(`${prefix}:`)
    );
  });
}

/**
 * Returns the tools to deny when the session works on a pull request from an
 * author without write access, or an empty list when no restriction applies.
 * Workflows opt in with restrict_untrusted_prs: true.
 */
export async function getUntrustedPrDisallowedTools(
  octokit: Octokit,
  context: ParsedGitHubContext,
): Promise<string[]> {
  const enabled =
    process.env.RESTRICT_UNTRUSTED_PRS?.trim().toLowerCase() === "true";
  if (!enabled || !context.isPR) {
    return [];
  }
  if (await isPrAuthorTrusted(octokit, context)) {
    return [];
  }

  core.warning(
    `The author of pull request #${context.entityNumber} does not have write access, so commands that run code from the checkout are denied (restrict_untrusted_prs).`,
  );

  const uncovered = parseAllowedTools(process.env.CLAUDE_ARGS || "").filter(
    (tool) => tool === "Bash" || (tool.startsWith("Bash(") && !isDenied(tool)),
  );
  if (uncovered.length > 0) {
    core.warning(
      `These rules in claude_args stay allowed. Check that they cannot run code from the pull request: ${uncovered.join(", ")}`,
    );
  }

  return UNTRUSTED_PR_DISALLOWED_TOOLS;
}
