import * as core from "@actions/core";
import type { Octokits } from "../../github/api/client";
import type { GitHubContext, ParsedGitHubContext } from "../../github/context";
import { isEntityContext } from "../../github/context";
import { checkHumanActor } from "../../github/validation/actor";
import {
  configureGitAuth,
  setupSshSigning,
} from "../../github/operations/git-config";
import { setupBranch, type BranchInfo } from "../../github/operations/branch";
import {
  fetchGitHubData,
  extractTriggerTimestamp,
  extractOriginalTitle,
  extractOriginalBody,
} from "../../github/data/fetcher";
import { formatContext, formatBody } from "../../github/data/formatter";
import { prepareMcpConfig } from "../../mcp/install-mcp-server";
import { runClaude } from "../../../base-action/src/run-claude";
import type { ClaudeRunResult } from "../../../base-action/src/run-claude-sdk";
import { resolveAgents, type ReviewAgent } from "./agents";
import { AGENT_FINDINGS_SCHEMA, AGENT_REBUTTAL_SCHEMA } from "./schemas";
import type { AgentFindings, AgentRebuttal } from "./schemas";
import {
  generateAgentPrompt,
  generateDebatePrompt,
  generateSynthesisPrompt,
  generateSingleAgentPrompt,
  buildAgentClaudeArgs,
} from "./prompts";
import { ReviewTracker } from "./tracking";
import { mergeExecutionFiles } from "./merge-execution";
import { runTriage } from "./triage";

type ReviewResult = {
  commentId: number | undefined;
  branchInfo: BranchInfo;
  executionFile?: string;
  claudeSuccess: boolean;
};

export async function prepareAndRunReview({
  context,
  octokit,
  githubToken,
  multiAgentReview,
}: {
  context: GitHubContext;
  octokit: Octokits;
  githubToken: string;
  multiAgentReview: string;
}): Promise<ReviewResult> {
  if (!isEntityContext(context)) {
    throw new Error("Review mode requires entity context (PR)");
  }
  if (!context.isPR) {
    throw new Error("Review mode is only supported for Pull Requests");
  }

  // Validate human actor
  await checkHumanActor(octokit.rest, context);

  // Resolve agents from spec file / input / defaults
  const { agents, debateRounds, synthesisPerspective } = await resolveAgents({
    reviewProtocolPath: context.inputs.reviewProtocolPath,
    reviewAgents: context.inputs.reviewAgents,
    reviewDebateRounds: context.inputs.reviewDebateRounds,
    reviewMaxAgents: context.inputs.reviewMaxAgents,
  });

  core.info(
    `Review mode: ${agents.length} agents, ${debateRounds} debate round(s)`,
  );

  // Configure git auth
  const useSshSigning = !!context.inputs.sshSigningKey;
  const useApiCommitSigning = context.inputs.useCommitSigning && !useSshSigning;

  if (useSshSigning) {
    await setupSshSigning(context.inputs.sshSigningKey);
    const user = {
      login: context.inputs.botName,
      id: parseInt(context.inputs.botId),
    };
    await configureGitAuth(githubToken, context, user);
  } else if (!useApiCommitSigning) {
    const user = {
      login: context.inputs.botName,
      id: parseInt(context.inputs.botId),
    };
    await configureGitAuth(githubToken, context, user);
  }

  // Fetch GitHub data once (shared across all agents)
  const triggerTime = extractTriggerTimestamp(context);
  const originalTitle = extractOriginalTitle(context);
  const originalBody = extractOriginalBody(context);

  const githubData = await fetchGitHubData({
    octokits: octokit,
    repository: `${context.repository.owner}/${context.repository.repo}`,
    prNumber: context.entityNumber.toString(),
    isPR: true,
    triggerUsername: context.actor,
    triggerTime,
    originalTitle,
    originalBody,
    includeCommentsByActor: context.inputs.includeCommentsByActor,
    excludeCommentsByActor: context.inputs.excludeCommentsByActor,
  });

  // Setup branch
  const branchInfo = await setupBranch(octokit, githubData, context);

  // Build GitHub context markdown (shared across all agents)
  const githubContextMarkdown = buildGitHubContextMarkdown(githubData, context);

  // Optional team guidance sourced from the workflow `prompt:` input.
  // Threaded into every agent prompt so role-specific perspectives still
  // apply the team's conventions (style, testing rules, etc.). Empty string
  // is normalized to undefined so downstream templates can skip the section.
  const teamGuidance = context.inputs.prompt?.trim() || undefined;

  // Create tracking comment
  const tracker = new ReviewTracker(
    octokit.rest,
    context.repository.owner,
    context.repository.repo,
    agents,
  );
  const trackingCommentId = await tracker.createComment(context.entityNumber);

  // Create a separate comment for the synthesis review
  // This prevents the tracker from overwriting the final review
  const synthesisComment = await octokit.rest.issues.createComment({
    owner: context.repository.owner,
    repo: context.repository.repo,
    issue_number: context.entityNumber,
    body: "⏳ *Multi-agent review in progress...*",
  });
  const synthesisCommentId = synthesisComment.data.id;

  // Prepare MCP config (read-only for review agents)
  const mcpConfig = await prepareMcpConfig({
    githubToken,
    owner: context.repository.owner,
    repo: context.repository.repo,
    branch: branchInfo.claudeBranch || branchInfo.currentBranch,
    baseBranch: branchInfo.baseBranch,
    claudeCommentId: trackingCommentId.toString(),
    allowedTools: [],
    mode: "review",
    context,
  });

  // === Triage (for "auto" mode) ===
  let useMultiAgent = multiAgentReview === "true";
  let triageReasoning =
    multiAgentReview === "true" ? "forced by configuration" : "";

  if (multiAgentReview === "auto") {
    const triageDecision = await runTriage(branchInfo.baseBranch, mcpConfig);
    useMultiAgent = triageDecision.useMultiAgent;
    triageReasoning = triageDecision.reasoning;
  }

  if (!useMultiAgent) {
    core.info("Using single-agent review mode");
    await tracker.setReviewMode("single-agent", triageReasoning);
    return runSingleAgentReview({
      githubContextMarkdown,
      githubToken,
      context,
      branchInfo,
      trackingCommentId,
      synthesisCommentId,
      tracker,
      teamGuidance,
    });
  }

  core.info("Using multi-agent review mode");
  await tracker.setReviewMode("multi-agent", triageReasoning);

  const baseClaudeArgs = buildBaseClaudeArgs(mcpConfig);
  const executionFiles: string[] = [];

  // === Round 1: Independent Reviews (parallel) ===
  const allFindings: AgentFindings[] = [];

  const round1Results = await Promise.allSettled(
    agents.map(async (agent) => {
      await tracker.updateAgentStatus(agent.name, "running");
      const findings = await runReviewAgent(
        agent,
        githubContextMarkdown,
        baseClaudeArgs,
        `review-r1-${agent.id}`,
        teamGuidance,
      );
      await tracker.updateAgentStatus(agent.name, "complete", findings);
      return {
        agentId: agent.id,
        findings,
      };
    }),
  );

  for (const [i, result] of round1Results.entries()) {
    if (result.status === "fulfilled") {
      allFindings.push(result.value.findings);
      executionFiles.push(
        `${process.env.RUNNER_TEMP}/claude-execution-review-r1-${result.value.agentId}.json`,
      );
    } else {
      core.warning(`Agent ${agents[i]!.id} failed: ${result.reason}`);
      await tracker.updateAgentStatus(agents[i]!.name, "error");
    }
  }

  // === Round 2: Debate (parallel) ===
  const allRebuttals: AgentRebuttal[] = [];

  if (debateRounds > 0 && allFindings.length > 1) {
    await tracker.updateDebateStatus("running");

    const debateResults = await Promise.allSettled(
      agents
        .filter((agent) => allFindings.some((f) => f.agent_id === agent.id))
        .map(async (agent) => {
          const ownFindings = allFindings.find((f) => f.agent_id === agent.id)!;
          const otherFindings = allFindings.filter(
            (f) => f.agent_id !== agent.id,
          );
          const rebuttal = await runDebateAgent(
            agent,
            ownFindings,
            otherFindings,
            baseClaudeArgs,
            `review-r2-${agent.id}`,
            teamGuidance,
          );
          return { agentId: agent.id, rebuttal };
        }),
    );

    for (const result of debateResults) {
      if (result.status === "fulfilled") {
        allRebuttals.push(result.value.rebuttal);
        executionFiles.push(
          `${process.env.RUNNER_TEMP}/claude-execution-review-r2-${result.value.agentId}.json`,
        );
      } else {
        core.warning(`Debate agent failed: ${result.reason}`);
      }
    }

    await tracker.updateDebateStatus("complete");
  } else if (debateRounds === 0) {
    await tracker.updateDebateStatus("complete");
  }

  // === Synthesis ===
  let synthesisSuccess = false;
  await tracker.updateSynthesisStatus("running");

  if (allFindings.length > 0) {
    try {
      await runSynthesisAgent(
        synthesisPerspective,
        allFindings,
        allRebuttals,
        githubToken,
        context,
        synthesisCommentId,
        teamGuidance,
      );

      const execFile = `${process.env.RUNNER_TEMP}/claude-execution-review-synthesis.json`;
      executionFiles.push(execFile);
      synthesisSuccess = true;
      await tracker.updateSynthesisStatus("complete");
    } catch (error) {
      core.warning(`Synthesis agent failed: ${error}`);
      await tracker.updateSynthesisStatus("error");

      // Fallback: post raw findings as markdown
      try {
        const fallback = formatFindingsAsFallback(allFindings, allRebuttals);
        await octokit.rest.issues.updateComment({
          owner: context.repository.owner,
          repo: context.repository.repo,
          comment_id: synthesisCommentId,
          body: fallback,
        });
        synthesisSuccess = true; // Fallback posted successfully
      } catch (fallbackError) {
        core.warning(`Failed to post fallback review: ${fallbackError}`);
      }
    }
  } else {
    // No findings at all — update synthesis comment
    await octokit.rest.issues.updateComment({
      owner: context.repository.owner,
      repo: context.repository.repo,
      comment_id: synthesisCommentId,
      body: "## 🔍 Multi-Agent Peer Review\n\nNo agents produced findings. Review could not be completed.",
    });
    await tracker.updateSynthesisStatus("error");
  }

  // Merge all execution files
  const mergedExecutionFile = `${process.env.RUNNER_TEMP}/claude-execution-output.json`;
  await mergeExecutionFiles(executionFiles, mergedExecutionFile);

  return {
    commentId: trackingCommentId,
    branchInfo,
    executionFile: mergedExecutionFile,
    claudeSuccess: allFindings.length > 0 && synthesisSuccess,
  };
}

async function runSingleAgentReview({
  githubContextMarkdown,
  githubToken,
  context,
  branchInfo,
  trackingCommentId,
  synthesisCommentId,
  tracker,
  teamGuidance,
}: {
  githubContextMarkdown: string;
  githubToken: string;
  context: ParsedGitHubContext;
  branchInfo: BranchInfo;
  trackingCommentId: number;
  synthesisCommentId: number;
  tracker: ReviewTracker;
  teamGuidance?: string;
}): Promise<ReviewResult> {
  const executionFilePath = `${process.env.RUNNER_TEMP}/claude-execution-review-single.json`;

  // Single agent gets both comment and inline comment tools
  const singleAgentMcpConfig = await prepareMcpConfig({
    githubToken,
    owner: context.repository.owner,
    repo: context.repository.repo,
    branch: branchInfo.claudeBranch || branchInfo.currentBranch,
    baseBranch: branchInfo.baseBranch,
    claudeCommentId: synthesisCommentId.toString(),
    allowedTools: [
      "mcp__github_comment__update_claude_comment",
      "mcp__github_inline_comment__create_inline_comment",
    ],
    mode: "review",
    context,
  });

  const escapedConfig = singleAgentMcpConfig.replace(/'/g, "'\\''");
  const claudeArgs = `--mcp-config '${escapedConfig}' --permission-mode acceptEdits --allowedTools "Glob,Grep,Read,LS,mcp__github_comment__update_claude_comment,mcp__github_inline_comment__create_inline_comment"`;

  const promptPath = await generateSingleAgentPrompt(
    githubContextMarkdown,
    teamGuidance,
  );

  await tracker.updateSynthesisStatus("running");

  let success = false;
  try {
    await runClaude(promptPath, {
      claudeArgs,
      appendSystemPrompt:
        "You are a thorough code reviewer. Provide a comprehensive review covering correctness, code quality, security, performance, and conventions.",
      showFullOutput: process.env.INPUT_SHOW_FULL_OUTPUT,
      executionFilePath,
    });
    success = true;
    await tracker.updateSynthesisStatus("complete");
  } catch (error) {
    core.warning(`Single-agent review failed: ${error}`);
    await tracker.updateSynthesisStatus("error");
  }

  // Merge execution file
  const mergedExecutionFile = `${process.env.RUNNER_TEMP}/claude-execution-output.json`;
  await mergeExecutionFiles([executionFilePath], mergedExecutionFile);

  return {
    commentId: trackingCommentId,
    branchInfo,
    executionFile: mergedExecutionFile,
    claudeSuccess: success,
  };
}

function validateStructuredOutput<T>(
  raw: string,
  requiredFields: string[],
  label: string,
): T {
  const parsed = JSON.parse(raw);
  for (const field of requiredFields) {
    if (parsed[field] === undefined) {
      throw new Error(`${label}: missing required field '${field}'`);
    }
  }
  return parsed as T;
}

async function runReviewAgent(
  agent: ReviewAgent,
  githubContextMarkdown: string,
  baseClaudeArgs: string,
  executionId: string,
  teamGuidance?: string,
): Promise<AgentFindings> {
  const promptPath = await generateAgentPrompt(
    agent,
    githubContextMarkdown,
    teamGuidance,
  );
  const claudeArgs = buildAgentClaudeArgs(
    baseClaudeArgs,
    AGENT_FINDINGS_SCHEMA,
  );
  const executionFilePath = `${process.env.RUNNER_TEMP}/claude-execution-${executionId}.json`;

  core.info(`Running review agent: ${agent.name} (${agent.id})`);

  const result = await runClaude(promptPath, {
    claudeArgs,
    appendSystemPrompt: agent.perspective,
    model: agent.model,
    maxTurns: agent.maxTurns ? String(agent.maxTurns) : undefined,
    showFullOutput: process.env.INPUT_SHOW_FULL_OUTPUT,
    executionFilePath,
  });

  if (!result.structuredOutput) {
    throw new Error(`Agent ${agent.id} did not produce structured output`);
  }

  return validateStructuredOutput<AgentFindings>(
    result.structuredOutput,
    ["agent_id", "agent_name", "summary", "findings"],
    `Agent ${agent.id}`,
  );
}

async function runDebateAgent(
  agent: ReviewAgent,
  ownFindings: AgentFindings,
  otherFindings: AgentFindings[],
  baseClaudeArgs: string,
  executionId: string,
  teamGuidance?: string,
): Promise<AgentRebuttal> {
  const promptPath = await generateDebatePrompt(
    agent,
    ownFindings,
    otherFindings,
    teamGuidance,
  );
  const claudeArgs = buildAgentClaudeArgs(
    baseClaudeArgs,
    AGENT_REBUTTAL_SCHEMA,
  );
  const executionFilePath = `${process.env.RUNNER_TEMP}/claude-execution-${executionId}.json`;

  core.info(`Running debate agent: ${agent.name} (${agent.id})`);

  const result = await runClaude(promptPath, {
    claudeArgs,
    appendSystemPrompt: agent.perspective,
    model: agent.model,
    maxTurns: agent.maxTurns ? String(agent.maxTurns) : undefined,
    showFullOutput: process.env.INPUT_SHOW_FULL_OUTPUT,
    executionFilePath,
  });

  if (!result.structuredOutput) {
    throw new Error(
      `Debate agent ${agent.id} did not produce structured output`,
    );
  }

  return validateStructuredOutput<AgentRebuttal>(
    result.structuredOutput,
    ["agent_id", "agent_name", "responses"],
    `Debate agent ${agent.id}`,
  );
}

async function runSynthesisAgent(
  synthesisPerspective: string,
  allFindings: AgentFindings[],
  allRebuttals: AgentRebuttal[],
  githubToken: string,
  context: ParsedGitHubContext,
  synthesisCommentId: number,
  teamGuidance?: string,
): Promise<ClaudeRunResult> {
  const promptPath = await generateSynthesisPrompt(
    synthesisPerspective,
    allFindings,
    allRebuttals,
    teamGuidance,
  );
  const executionFilePath = `${process.env.RUNNER_TEMP}/claude-execution-review-synthesis.json`;

  // Synthesis agent gets the comment MCP server to post its review
  const synthesisMcpConfig = await prepareMcpConfig({
    githubToken,
    owner: context.repository.owner,
    repo: context.repository.repo,
    branch: "",
    baseBranch: "",
    claudeCommentId: synthesisCommentId.toString(),
    allowedTools: [
      "mcp__github_comment__update_claude_comment",
      "mcp__github_inline_comment__create_inline_comment",
    ],
    mode: "review",
    context,
  });

  const escapedConfig = synthesisMcpConfig.replace(/'/g, "'\\''");
  const claudeArgs = `--mcp-config '${escapedConfig}' --permission-mode acceptEdits --allowedTools "Glob,Grep,Read,mcp__github_comment__update_claude_comment,mcp__github_inline_comment__create_inline_comment"`;

  core.info("Running synthesis agent");

  return runClaude(promptPath, {
    claudeArgs,
    appendSystemPrompt: synthesisPerspective,
    maxTurns: "15",
    showFullOutput: process.env.INPUT_SHOW_FULL_OUTPUT,
    executionFilePath,
  });
}

function buildBaseClaudeArgs(mcpConfig: string): string {
  const escapedConfig = mcpConfig.replace(/'/g, "'\\''");
  // Review agents are read-only — no file write tools
  return `--mcp-config '${escapedConfig}' --permission-mode acceptEdits --allowedTools "Glob,Grep,Read,LS"`;
}

function buildGitHubContextMarkdown(
  githubData: Awaited<ReturnType<typeof fetchGitHubData>>,
  context: ParsedGitHubContext,
): string {
  const sections: string[] = [];

  sections.push(`## Repository
${context.repository.owner}/${context.repository.repo}`);

  if (githubData.contextData) {
    sections.push(
      `## PR Context\n${formatContext(githubData.contextData, true)}`,
    );

    if (githubData.contextData.body) {
      sections.push(
        `## PR Description\n${formatBody(githubData.contextData.body, githubData.imageUrlMap || new Map())}`,
      );
    }
  }

  return sections.join("\n\n");
}

function formatFindingsAsFallback(
  allFindings: AgentFindings[],
  allRebuttals: AgentRebuttal[],
): string {
  const parts: string[] = [];

  parts.push("## 🔍 Multi-Agent Peer Review Results");
  parts.push(
    "*Note: Synthesis agent failed. Showing raw findings from individual reviewers.*\n",
  );

  for (const f of allFindings) {
    parts.push(`### ${f.agent_name}`);
    parts.push(f.summary);

    if (f.overall_assessment) {
      parts.push(`**Overall:** ${f.overall_assessment}`);
    }

    parts.push("");
    for (const finding of f.findings) {
      const loc = finding.file
        ? ` (\`${finding.file}${finding.line ? `:${finding.line}` : ""}\`)`
        : "";
      parts.push(
        `- **[${finding.severity.toUpperCase()}]** ${finding.title}: ${finding.description}${loc}`,
      );
    }
    parts.push("");
  }

  if (allRebuttals.length > 0) {
    parts.push("### Debate Responses\n");
    for (const r of allRebuttals) {
      for (const resp of r.responses) {
        parts.push(
          `- **${r.agent_name}** re: ${resp.regarding_finding_title} → *${resp.stance}*: ${resp.reasoning}`,
        );
      }
    }
  }

  return parts.join("\n");
}
