import * as core from "@actions/core";
import type { Octokit } from "@octokit/rest";
import {
  parseAllowedTools,
  stripShellComments,
} from "../../modes/agent/parse-tools";
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

const SKIPS_PERMISSION_CHECKS =
  /--(allow-)?dangerously-skip-permissions|--permission-mode[=\s]+["']?bypassPermissions/;

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

type LookupError = Error & { retryable: boolean };

/**
 * Reduces a failed API call to its HTTP status, so that nothing else from the
 * error can reach the workflow log, and decides whether to try again. A 404 (not
 * a user account) or a plain 403 won't change, but GitHub also uses 403 for rate
 * limits. Whatever the outcome, a failed lookup counts as untrusted.
 */
function toLookupError(error: unknown): LookupError {
  const { status, response } = error as {
    status?: number;
    response?: { headers?: Record<string, string | number | undefined> };
  };
  const headers = response?.headers;
  const rateLimited =
    status === 429 ||
    (status === 403 &&
      (headers?.["retry-after"] !== undefined ||
        String(headers?.["x-ratelimit-remaining"]) === "0"));
  return Object.assign(
    new Error(status === undefined ? "no response" : `HTTP ${status}`),
    {
      retryable: status === undefined || status >= 500 || rateLimited,
    },
  );
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
      async () => {
        try {
          return await octokit.repos.getCollaboratorPermissionLevel({
            owner: context.repository.owner,
            repo: context.repository.repo,
            username: author,
          });
        } catch (error) {
          throw toLookupError(error);
        }
      },
      {
        initialDelayMs: 1000,
        shouldRetry: (error) => (error as LookupError).retryable,
      },
    );
    const { permission } = response.data;
    return permission === "admin" || permission === "write";
  } catch (error) {
    // Only the bounded text from toLookupError reaches the log.
    core.warning(
      `Could not check repository access for pull request author ${author}, treating them as untrusted: ${(error as Error).message}`,
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
 * On by default: only restrict_untrusted_prs: false turns it off, so a mistyped
 * value keeps the restriction.
 */
export async function getUntrustedPrDisallowedTools(
  octokit: Octokit,
  context: ParsedGitHubContext,
): Promise<string[]> {
  const disabled =
    process.env.RESTRICT_UNTRUSTED_PRS?.trim().toLowerCase() === "false";
  if (disabled || !context.isPR) {
    return [];
  }
  if (await isPrAuthorTrusted(octokit, context)) {
    return [];
  }

  core.warning(
    `The author of pull request #${context.entityNumber} is not confirmed to have write access, so commands that run code from the checkout are denied. Set restrict_untrusted_prs to "false" to turn this off.`,
  );

  // These warnings report a count and fixed text, not the content of claude_args,
  // which is never printed to the workflow log.
  const claudeArgs = process.env.CLAUDE_ARGS || "";
  const uncovered = parseAllowedTools(claudeArgs).filter(
    (tool) => tool === "Bash" || (tool.startsWith("Bash(") && !isDenied(tool)),
  );
  if (uncovered.length > 0) {
    core.warning(
      `${uncovered.length} Bash rule(s) in claude_args are not on the deny list and stay allowed. Check that they cannot run code from the pull request.`,
    );
  }
  if (SKIPS_PERMISSION_CHECKS.test(stripShellComments(claudeArgs))) {
    core.warning(
      "claude_args turns off permission checks, so commands that are not on the deny list run without approval.",
    );
  }

  return UNTRUSTED_PR_DISALLOWED_TOOLS;
}
