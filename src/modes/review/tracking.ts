import * as core from "@actions/core";
import type { Octokit } from "@octokit/rest";
import type { ReviewAgent } from "./agents";
import type { AgentFindings } from "./schemas";

export type AgentStatus = "pending" | "running" | "complete" | "error";

type TrackingState = {
  agents: Map<string, { status: AgentStatus; findingsCount?: string }>;
  debateStatus: AgentStatus;
  synthesisStatus: AgentStatus;
  reviewMode?: {
    mode: "multi-agent" | "single-agent";
    reasoning: string;
  };
};

const STATUS_ICONS: Record<AgentStatus, string> = {
  pending: "⬜",
  running: "⏳",
  complete: "✅",
  error: "❌",
};

function renderTrackingTable(state: TrackingState): string {
  const modeHeader = state.reviewMode
    ? `> **Mode:** ${state.reviewMode.mode === "multi-agent" ? "🔀 Multi-Agent" : "🔹 Single-Agent"} — ${state.reviewMode.reasoning}\n\n`
    : "";

  if (state.reviewMode?.mode === "single-agent") {
    const synthesisIcon = STATUS_ICONS[state.synthesisStatus];
    return `## 🔍 PR Review

${modeHeader}| Step | Status |
|------|--------|
| Review | ${synthesisIcon} ${state.synthesisStatus.charAt(0).toUpperCase() + state.synthesisStatus.slice(1)} |

*Powered by Claude Code Action*`;
  }

  const agentRows = Array.from(state.agents.entries())
    .map(([name, { status, findingsCount }]) => {
      const icon = STATUS_ICONS[status];
      const findings = findingsCount || "-";
      return `| ${name} | ${icon} ${status.charAt(0).toUpperCase() + status.slice(1)} | ${findings} |`;
    })
    .join("\n");

  const debateIcon = STATUS_ICONS[state.debateStatus];
  const synthesisIcon = STATUS_ICONS[state.synthesisStatus];

  return `## 🔍 Multi-Agent Peer Review

${modeHeader}| Persona | Status | Findings |
|---------|--------|----------|
${agentRows}
| Debate Round | ${debateIcon} ${state.debateStatus.charAt(0).toUpperCase() + state.debateStatus.slice(1)} | - |
| Synthesis | ${synthesisIcon} ${state.synthesisStatus.charAt(0).toUpperCase() + state.synthesisStatus.slice(1)} | - |

*Powered by Claude Code Action — Multi-Agent Review*`;
}

export class ReviewTracker {
  private state: TrackingState;
  private commentId: number | undefined;
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(
    octokit: Octokit,
    owner: string,
    repo: string,
    agents: ReviewAgent[],
  ) {
    this.octokit = octokit;
    this.owner = owner;
    this.repo = repo;
    this.state = {
      agents: new Map(
        agents.map((a) => [a.name, { status: "pending" as AgentStatus }]),
      ),
      debateStatus: "pending",
      synthesisStatus: "pending",
    };
  }

  async createComment(issueNumber: number): Promise<number> {
    const body = renderTrackingTable(this.state);
    const response = await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
    });
    this.commentId = response.data.id;
    return this.commentId;
  }

  async setReviewMode(
    mode: "multi-agent" | "single-agent",
    reasoning: string,
  ): Promise<void> {
    this.state.reviewMode = { mode, reasoning };
    await this.updateComment();
  }

  async updateAgentStatus(
    agentName: string,
    status: AgentStatus,
    findings?: AgentFindings,
  ): Promise<void> {
    const entry = this.state.agents.get(agentName);
    if (entry) {
      entry.status = status;
      if (findings) {
        const counts = findings.findings.reduce(
          (acc, f) => {
            acc[f.severity] = (acc[f.severity] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );
        const parts: string[] = [];
        if (counts.critical) parts.push(`${counts.critical} critical`);
        if (counts.warning) parts.push(`${counts.warning} warning`);
        if (counts.suggestion) parts.push(`${counts.suggestion} suggestion`);
        if (counts.nitpick) parts.push(`${counts.nitpick} nitpick`);
        entry.findingsCount = parts.join(", ") || "No issues found";
      }
    }
    await this.updateComment();
  }

  async updateDebateStatus(status: AgentStatus): Promise<void> {
    this.state.debateStatus = status;
    await this.updateComment();
  }

  async updateSynthesisStatus(status: AgentStatus): Promise<void> {
    this.state.synthesisStatus = status;
    await this.updateComment();
  }

  private async updateComment(): Promise<void> {
    if (!this.commentId) return;

    const body = renderTrackingTable(this.state);
    try {
      await this.octokit.issues.updateComment({
        owner: this.owner,
        repo: this.repo,
        comment_id: this.commentId,
        body,
      });
    } catch (error) {
      core.warning(`Failed to update tracking comment: ${error}`);
    }
  }
}
