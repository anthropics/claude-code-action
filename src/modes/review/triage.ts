import * as core from "@actions/core";
import { writeFile, mkdir } from "fs/promises";
import { execFileSync } from "child_process";
import { runClaude } from "../../../base-action/src/run-claude";

const PROMPT_DIR = `${process.env.RUNNER_TEMP || "/tmp"}/claude-prompts`;

const TRIAGE_SCHEMA = {
  type: "object" as const,
  properties: {
    use_multi_agent: {
      type: "boolean" as const,
      description:
        "Whether to use multi-agent review (true) or single-agent review (false)",
    },
    reasoning: {
      type: "string" as const,
      description: "Brief explanation of why this routing decision was made",
    },
  },
  required: ["use_multi_agent", "reasoning"],
  additionalProperties: false,
};

type TriageDecision = {
  useMultiAgent: boolean;
  reasoning: string;
};

function getDiffStats(baseBranch: string): string {
  try {
    let stats: string;
    try {
      stats = execFileSync("git", ["diff", "--stat", `${baseBranch}...HEAD`], {
        encoding: "utf-8",
        maxBuffer: 1024 * 1024,
      }).trim();
    } catch {
      try {
        stats = execFileSync("git", ["diff", "--stat", "HEAD~1"], {
          encoding: "utf-8",
          maxBuffer: 1024 * 1024,
        }).trim();
      } catch {
        return "Unable to get diff stats";
      }
    }

    let shortlog = "";
    try {
      shortlog = execFileSync(
        "git",
        ["diff", "--shortstat", `${baseBranch}...HEAD`],
        { encoding: "utf-8", maxBuffer: 1024 * 1024 },
      ).trim();
    } catch {
      try {
        shortlog = execFileSync("git", ["diff", "--shortstat", "HEAD~1"], {
          encoding: "utf-8",
          maxBuffer: 1024 * 1024,
        }).trim();
      } catch {
        // shortlog stays empty
      }
    }

    return `${stats}\n\nSummary: ${shortlog}`;
  } catch {
    return "Unable to get diff stats";
  }
}

export async function runTriage(
  baseBranch: string,
  mcpConfig: string,
): Promise<TriageDecision> {
  await mkdir(PROMPT_DIR, { recursive: true });

  const diffStats = getDiffStats(baseBranch);

  const prompt = `You are a PR review triage agent. Based on the diff statistics below, decide whether this PR needs multi-agent review (multiple specialized reviewers) or single-agent review (one comprehensive reviewer).

## Diff Statistics

${diffStats}

## Decision Criteria

Use MULTI-AGENT review when:
- Many files changed (roughly 5+)
- Large total line changes (roughly 200+)
- Changes span multiple areas (e.g., both source and tests, multiple packages)
- Mix of new files and modified files suggesting a new feature

Use SINGLE-AGENT review when:
- Few files changed (1-4)
- Small total line changes (under ~200)
- Changes are localized (single module or focused fix)
- Mostly config changes, docs, or simple bug fixes

Make a clear decision. When in doubt, prefer single-agent for efficiency.`;

  const promptPath = `${PROMPT_DIR}/review-triage.txt`;
  await writeFile(promptPath, prompt);

  const escapedConfig = mcpConfig.replace(/'/g, "'\\''");
  const schemaJson = JSON.stringify(TRIAGE_SCHEMA).replace(/'/g, "'\\''");
  const claudeArgs = `--mcp-config '${escapedConfig}' --permission-mode acceptEdits --allowedTools "Glob,Grep,Read,LS" --json-schema '${schemaJson}'`;

  core.info("Running triage agent to determine review strategy...");

  try {
    const result = await runClaude(promptPath, {
      claudeArgs,
      appendSystemPrompt:
        "You are a lightweight triage agent. Analyze the diff statistics and make a quick routing decision. Do not read any files — just use the stats provided.",
      maxTurns: "3",
      showFullOutput: process.env.INPUT_SHOW_FULL_OUTPUT,
    });

    if (result.structuredOutput) {
      const parsed = JSON.parse(result.structuredOutput);
      const decision: TriageDecision = {
        useMultiAgent: !!parsed.use_multi_agent,
        reasoning: String(parsed.reasoning || ""),
      };
      core.info(
        `Triage decision: ${decision.useMultiAgent ? "multi-agent" : "single-agent"} — ${decision.reasoning}`,
      );
      return decision;
    }
  } catch (error) {
    core.warning(
      `Triage agent failed: ${error}. Falling back to single-agent review.`,
    );
  }

  // Default fallback: single-agent
  return {
    useMultiAgent: false,
    reasoning:
      "Triage failed or produced no output; defaulting to single-agent",
  };
}
