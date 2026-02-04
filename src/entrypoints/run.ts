#!/usr/bin/env bun

/**
 * Unified entrypoint for the Claude Code Action.
 * Merges all previously separate action.yml steps (prepare, install, run, cleanup)
 * into a single TypeScript orchestrator.
 */

import * as core from "@actions/core";
import { spawn } from "child_process";
import { appendFile } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { setupGitHubToken, WorkflowValidationSkipError } from "../github/token";
import { checkWritePermissions } from "../github/validation/permissions";
import { createOctokit } from "../github/api/client";
import type { Octokits } from "../github/api/client";
import { parseGitHubContext, isEntityContext } from "../github/context";
import type { GitHubContext } from "../github/context";
import { getMode } from "../modes/registry";
import { prepare } from "../prepare";
import { collectActionInputsPresence } from "./collect-inputs";
import { updateCommentLink } from "./update-comment-link";
import { formatTurnsFromData } from "./format-turns";
import type { Turn } from "./format-turns";
import { cleanupSshSigning } from "../github/operations/git-config";
import { GITHUB_API_URL } from "../github/api/config";

// Base-action imports (used directly instead of subprocess)
import { validateEnvironmentVariables } from "../../base-action/src/validate-env";
import { setupClaudeCodeSettings } from "../../base-action/src/setup-claude-code-settings";
import { installPlugins } from "../../base-action/src/install-plugins";
import { preparePrompt } from "../../base-action/src/prepare-prompt";
import { runClaude } from "../../base-action/src/run-claude";
import type { ClaudeRunResult } from "../../base-action/src/run-claude-sdk";

/**
 * Install Claude Code CLI, handling retry logic and custom executable paths.
 */
async function installClaudeCode(): Promise<void> {
  const customExecutable = process.env.PATH_TO_CLAUDE_CODE_EXECUTABLE;
  if (customExecutable) {
    console.log(`Using custom Claude Code executable: ${customExecutable}`);
    const claudeDir = customExecutable.substring(
      0,
      customExecutable.lastIndexOf("/"),
    );
    // Add to PATH by appending to GITHUB_PATH
    const githubPath = process.env.GITHUB_PATH;
    if (githubPath) {
      await appendFile(githubPath, `${claudeDir}\n`);
    }
    // Also add to current process PATH
    process.env.PATH = `${claudeDir}:${process.env.PATH}`;
    return;
  }

  const claudeCodeVersion = "2.1.31";
  console.log(`Installing Claude Code v${claudeCodeVersion}...`);

  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`Installation attempt ${attempt}...`);
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          "bash",
          [
            "-c",
            `curl -fsSL https://claude.ai/install.sh | bash -s -- ${claudeCodeVersion}`,
          ],
          { stdio: "inherit" },
        );
        child.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Install failed with exit code ${code}`));
        });
        child.on("error", reject);
      });
      console.log("Claude Code installed successfully");
      // Add to PATH
      const homeBin = `${process.env.HOME}/.local/bin`;
      const githubPath = process.env.GITHUB_PATH;
      if (githubPath) {
        await appendFile(githubPath, `${homeBin}\n`);
      }
      process.env.PATH = `${homeBin}:${process.env.PATH}`;
      return;
    } catch (error) {
      if (attempt === 3) {
        throw new Error(
          `Failed to install Claude Code after 3 attempts: ${error}`,
        );
      }
      console.log("Installation failed, retrying...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

/**
 * Write the step summary from Claude's execution output file.
 */
async function writeStepSummary(executionFile: string): Promise<void> {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryFile) return;

  try {
    const fileContent = readFileSync(executionFile, "utf-8");
    const data: Turn[] = JSON.parse(fileContent);
    const markdown = formatTurnsFromData(data);
    await appendFile(summaryFile, markdown);
    console.log("Successfully formatted Claude Code report");
  } catch (error) {
    console.error(`Failed to format output: ${error}`);
    // Fall back to raw JSON
    try {
      let fallback = "## Claude Code Report (Raw Output)\n\n";
      fallback +=
        "Failed to format output (please report). Here's the raw JSON:\n\n";
      fallback += "```json\n";
      fallback += readFileSync(executionFile, "utf-8");
      fallback += "\n```\n";
      await appendFile(summaryFile, fallback);
    } catch {
      console.error("Failed to write raw output to step summary");
    }
  }
}

/**
 * Revoke the GitHub App installation token.
 */
async function revokeAppToken(githubToken: string): Promise<void> {
  try {
    const apiUrl = GITHUB_API_URL;
    const response = await fetch(`${apiUrl}/installation/token`, {
      method: "DELETE",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (response.ok) {
      console.log("App token revoked successfully");
    } else {
      console.error(
        `Failed to revoke app token: ${response.status} ${response.statusText}`,
      );
    }
  } catch (error) {
    console.error("Error revoking app token:", error);
  }
}

async function run() {
  let githubToken: string | undefined;
  let commentId: number | undefined;
  let claudeBranch: string | undefined;
  let baseBranch: string | undefined;
  let executionFile: string | undefined;
  let claudeSuccess = false;
  let prepareSuccess = true;
  let prepareError: string | undefined;
  let context: GitHubContext | undefined;
  let octokit: Octokits | undefined;
  let useSshSigning = false;
  let useOverrideToken = false;
  let skippedDueToWorkflowValidation = false;

  try {
    // Phase 1: Prepare
    const actionInputsPresent = collectActionInputsPresence();
    context = parseGitHubContext();
    const mode = getMode(context);

    try {
      githubToken = await setupGitHubToken();
    } catch (error) {
      if (error instanceof WorkflowValidationSkipError) {
        skippedDueToWorkflowValidation = true;
        core.setOutput("skipped_due_to_workflow_validation_mismatch", "true");
        console.log("Exiting due to workflow validation skip");
        return;
      }
      throw error;
    }

    useOverrideToken = !!process.env.OVERRIDE_GITHUB_TOKEN;
    octokit = createOctokit(githubToken);

    // Set GITHUB_TOKEN and GH_TOKEN in process env for downstream usage
    process.env.GITHUB_TOKEN = githubToken;
    process.env.GH_TOKEN = githubToken;

    // Check write permissions (only for entity contexts)
    if (isEntityContext(context)) {
      const hasWritePermissions = await checkWritePermissions(
        octokit.rest,
        context,
        context.inputs.allowedNonWriteUsers,
        useOverrideToken,
      );
      if (!hasWritePermissions) {
        throw new Error(
          "Actor does not have write permissions to the repository",
        );
      }
    }

    // Check trigger conditions
    const containsTrigger = mode.shouldTrigger(context);
    console.log(`Mode: ${mode.name}`);
    console.log(`Context prompt: ${context.inputs?.prompt || "NO PROMPT"}`);
    console.log(`Trigger result: ${containsTrigger}`);

    if (!containsTrigger) {
      console.log("No trigger found, skipping remaining steps");
      core.setOutput("github_token", githubToken);
      return;
    }

    // Run prepare
    const prepareResult = await prepare({
      context,
      octokit,
      mode,
      githubToken,
    });

    commentId = prepareResult.commentId;
    claudeBranch = prepareResult.branchInfo.claudeBranch;
    baseBranch = prepareResult.branchInfo.baseBranch;
    useSshSigning = !!context.inputs.sshSigningKey;

    // Set system prompt if available
    if (mode.getSystemPrompt) {
      const modeContext = mode.prepareContext(context, {
        commentId: prepareResult.commentId,
        baseBranch: prepareResult.branchInfo.baseBranch,
        claudeBranch: prepareResult.branchInfo.claudeBranch,
      });
      const systemPrompt = mode.getSystemPrompt(modeContext);
      if (systemPrompt) {
        core.exportVariable("APPEND_SYSTEM_PROMPT", systemPrompt);
      }
    }

    // Phase 2: Install Claude Code CLI
    await installClaudeCode();

    // Phase 3: Run Claude (import base-action directly)
    // Set env vars needed by the base-action code
    process.env.INPUT_ACTION_INPUTS_PRESENT = actionInputsPresent;
    process.env.CLAUDE_CODE_ACTION = "1";
    process.env.DETAILED_PERMISSION_MESSAGES = "1";

    validateEnvironmentVariables();

    await setupClaudeCodeSettings(process.env.INPUT_SETTINGS);

    await installPlugins(
      process.env.INPUT_PLUGIN_MARKETPLACES,
      process.env.INPUT_PLUGINS,
      process.env.INPUT_PATH_TO_CLAUDE_CODE_EXECUTABLE,
    );

    const promptFile =
      process.env.INPUT_PROMPT_FILE ||
      `${process.env.RUNNER_TEMP}/claude-prompts/claude-prompt.txt`;
    const promptConfig = await preparePrompt({
      prompt: "",
      promptFile,
    });

    const claudeResult: ClaudeRunResult = await runClaude(promptConfig.path, {
      claudeArgs: prepareResult.claudeArgs,
      appendSystemPrompt: process.env.APPEND_SYSTEM_PROMPT,
      model: process.env.ANTHROPIC_MODEL,
      pathToClaudeCodeExecutable:
        process.env.INPUT_PATH_TO_CLAUDE_CODE_EXECUTABLE,
      showFullOutput: process.env.INPUT_SHOW_FULL_OUTPUT,
    });

    claudeSuccess = claudeResult.conclusion === "success";
    executionFile = claudeResult.executionFile;

    // Set action-level outputs
    if (claudeResult.executionFile) {
      core.setOutput("execution_file", claudeResult.executionFile);
    }
    if (claudeResult.sessionId) {
      core.setOutput("session_id", claudeResult.sessionId);
    }
    if (claudeResult.structuredOutput) {
      core.setOutput("structured_output", claudeResult.structuredOutput);
    }
    core.setOutput("conclusion", claudeResult.conclusion);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    prepareSuccess = false;
    prepareError = errorMessage;
    core.setFailed(`Action failed with error: ${errorMessage}`);
  } finally {
    // Phase 4: Cleanup (always runs)

    // Update tracking comment
    if (
      commentId &&
      context &&
      isEntityContext(context) &&
      githubToken &&
      octokit
    ) {
      try {
        await updateCommentLink({
          commentId,
          githubToken,
          claudeBranch,
          baseBranch: baseBranch || "main",
          triggerUsername: context.actor,
          context,
          octokit,
          claudeSuccess,
          outputFile: executionFile,
          prepareSuccess,
          prepareError,
          useCommitSigning: context.inputs.useCommitSigning,
        });
      } catch (error) {
        console.error("Error updating comment with job link:", error);
      }
    }

    // Write step summary
    if (executionFile && existsSync(executionFile)) {
      await writeStepSummary(executionFile);
    }

    // Cleanup SSH signing key
    if (useSshSigning) {
      try {
        await cleanupSshSigning();
      } catch (error) {
        console.error("Failed to cleanup SSH signing key:", error);
      }
    }

    // Revoke app token (only if we're using the app token, not an override)
    if (githubToken && !useOverrideToken && !skippedDueToWorkflowValidation) {
      await revokeAppToken(githubToken);
    }

    // Set remaining action-level outputs
    core.setOutput("branch_name", claudeBranch);
    core.setOutput("github_token", githubToken);
  }
}

if (import.meta.main) {
  run();
}
