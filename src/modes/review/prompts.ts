import { writeFile, mkdir } from "fs/promises";
import type { ReviewAgent } from "./agents";
import type { AgentFindings, AgentRebuttal } from "./schemas";
import { AGENT_FINDINGS_SCHEMA, AGENT_REBUTTAL_SCHEMA } from "./schemas";

const PROMPT_DIR = `${process.env.RUNNER_TEMP || "/tmp"}/claude-prompts`;

// Wraps a workflow-provided prompt as a Team Guidance section. Returns an
// empty string when no guidance is supplied so the surrounding template
// collapses cleanly without spurious blank lines.
function formatTeamGuidanceSection(teamGuidance?: string): string {
  const trimmed = teamGuidance?.trim();
  if (!trimmed) return "";
  return `## Team Guidance

The following guidance is supplied by the team operating this review action.
Apply it in addition to your role-specific perspective.

${trimmed}

`;
}

function formatFindingsForContext(allFindings: AgentFindings[]): string {
  if (allFindings.length === 0) return "";

  const sections = allFindings.map((f) => {
    const findingLines = f.findings
      .map(
        (finding) =>
          `  - [${finding.severity.toUpperCase()}] ${finding.title}: ${finding.description}${
            finding.file
              ? ` (${finding.file}${finding.line ? `:${finding.line}` : ""})`
              : ""
          }`,
      )
      .join("\n");

    return `### ${f.agent_name} (${f.agent_id})
Summary: ${f.summary}
${f.overall_assessment ? `Overall: ${f.overall_assessment}` : ""}
Findings:
${findingLines}`;
  });

  return sections.join("\n\n");
}

function formatRebuttalsForContext(allRebuttals: AgentRebuttal[]): string {
  if (allRebuttals.length === 0) return "";

  const sections = allRebuttals.map((r) => {
    const responseLines = r.responses
      .map(
        (resp) =>
          `  - Re: ${resp.regarding_agent_id}/${resp.regarding_finding_title} → ${resp.stance}: ${resp.reasoning}`,
      )
      .join("\n");

    return `### ${r.agent_name} (${r.agent_id}) Debate Responses
${responseLines}`;
  });

  return sections.join("\n\n");
}

export async function generateAgentPrompt(
  agent: ReviewAgent,
  githubContextMarkdown: string,
  teamGuidance?: string,
): Promise<string> {
  await mkdir(PROMPT_DIR, { recursive: true });

  const prompt = `${agent.perspective}

You are reviewing a Pull Request. Analyze the changes carefully from your specific perspective.

${githubContextMarkdown}

${formatTeamGuidanceSection(teamGuidance)}## Instructions

1. Read the PR diff and understand the changes
2. Analyze from your specific review perspective described above
3. Report your findings as structured JSON output

Focus on actionable, specific findings. Reference exact files and line numbers where possible.
Do NOT report issues that are clearly intentional design decisions unless they are genuinely problematic.
Prioritize findings by severity: critical issues first, then warnings, suggestions, and nitpicks last.`;

  const promptPath = `${PROMPT_DIR}/review-agent-${agent.id}.txt`;
  await writeFile(promptPath, prompt);
  return promptPath;
}

export async function generateDebatePrompt(
  agent: ReviewAgent,
  ownFindings: AgentFindings,
  otherFindings: AgentFindings[],
  teamGuidance?: string,
): Promise<string> {
  await mkdir(PROMPT_DIR, { recursive: true });

  const othersContext = formatFindingsForContext(otherFindings);

  const prompt = `${agent.perspective}

${formatTeamGuidanceSection(teamGuidance)}You previously reviewed this PR and produced the following findings:

### Your Previous Findings (${ownFindings.agent_id})
Summary: ${ownFindings.summary}
${ownFindings.findings.map((f) => `  - [${f.severity.toUpperCase()}] ${f.title}: ${f.description}`).join("\n")}

## Other Reviewers' Findings

${othersContext}

## Instructions

Review the other agents' findings and provide your responses:
1. For each finding from other reviewers, state whether you agree, disagree, partially agree, or want to supplement
2. Provide reasoning for your stance
3. If you have revised or new findings based on what others found, include them

Be constructive and specific. If you disagree, explain why with concrete reasoning.`;

  const promptPath = `${PROMPT_DIR}/review-debate-${agent.id}.txt`;
  await writeFile(promptPath, prompt);
  return promptPath;
}

export async function generateSynthesisPrompt(
  synthesisPerspective: string,
  allFindings: AgentFindings[],
  allRebuttals: AgentRebuttal[],
  teamGuidance?: string,
): Promise<string> {
  await mkdir(PROMPT_DIR, { recursive: true });

  const findingsContext = formatFindingsForContext(allFindings);
  const rebuttalsContext = formatRebuttalsForContext(allRebuttals);

  const prompt = `${synthesisPerspective}

${formatTeamGuidanceSection(teamGuidance)}## All Agent Findings

${findingsContext}

${
  rebuttalsContext
    ? `## Debate Round Results

${rebuttalsContext}`
    : ""
}

## Instructions

Synthesize all findings into a final, comprehensive review comment for the PR.

Format the output as a well-structured markdown comment suitable for posting on GitHub.
Include:
1. An executive summary (1-2 sentences)
2. Critical issues that must be addressed (if any)
3. Warnings and suggestions grouped by theme
4. A final verdict: whether the PR is ready to merge, needs changes, or needs discussion

Do NOT use structured JSON output for this step — write a natural markdown review comment.
Reference specific files and line numbers from the findings.
Where reviewers disagreed, note the disagreement and provide your assessment.

## Inline Comments

For specific code-level findings (critical issues, warnings, and important suggestions),
use the mcp__github_inline_comment__create_inline_comment tool to post line-by-line review
comments directly on the PR diff. This provides developers with contextual feedback
right where the code changes are.

For each inline comment:
- Target the specific file and line number from the finding
- Keep the comment concise and actionable
- Include the severity level and a clear explanation

Post the overall summary via mcp__github_comment__update_claude_comment, and use inline
comments for specific line-level feedback.`;

  const promptPath = `${PROMPT_DIR}/review-synthesis.txt`;
  await writeFile(promptPath, prompt);
  return promptPath;
}

export async function generateSingleAgentPrompt(
  githubContextMarkdown: string,
  teamGuidance?: string,
): Promise<string> {
  await mkdir(PROMPT_DIR, { recursive: true });

  const prompt = `You are a comprehensive code reviewer. Analyze this Pull Request thoroughly from all perspectives: correctness, code quality, security, performance, and conventions.

${githubContextMarkdown}

${formatTeamGuidanceSection(teamGuidance)}## Instructions

1. Read the PR diff and changed files carefully
2. Analyze the changes from multiple perspectives:
   - **Correctness**: Logic bugs, edge cases, error handling
   - **Code Quality**: SOLID principles, DRY, readability, maintainability
   - **Security**: Injection vulnerabilities, auth issues, data exposure
   - **Performance**: Inefficiencies, unnecessary allocations, N+1 queries
   - **Conventions**: Naming, style, project patterns consistency
3. Write a well-structured markdown review comment

Format your review as:
1. An executive summary (1-2 sentences)
2. Critical issues that must be addressed (if any)
3. Warnings and suggestions grouped by theme
4. A final verdict: whether the PR is ready to merge, needs changes, or needs discussion

## Inline Comments

For specific code-level findings (critical issues, warnings, and important suggestions),
use the mcp__github_inline_comment__create_inline_comment tool to post line-by-line review
comments directly on the PR diff.

For each inline comment:
- Target the specific file and line number
- Keep the comment concise and actionable
- Include the severity level and a clear explanation

Post the overall summary via mcp__github_comment__update_claude_comment, and use inline
comments for specific line-level feedback.`;

  const promptPath = `${PROMPT_DIR}/review-single-agent.txt`;
  await writeFile(promptPath, prompt);
  return promptPath;
}

export function buildAgentClaudeArgs(
  baseClaudeArgs: string,
  schema: typeof AGENT_FINDINGS_SCHEMA | typeof AGENT_REBUTTAL_SCHEMA,
): string {
  const schemaJson = JSON.stringify(schema).replace(/'/g, "'\\''");
  return `${baseClaudeArgs} --json-schema '${schemaJson}'`.trim();
}
