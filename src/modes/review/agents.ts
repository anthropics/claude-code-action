import { readFile } from "fs/promises";
import { existsSync } from "fs";
import * as core from "@actions/core";
import { parse as parseYaml } from "yaml";

export type ReviewAgent = {
  id: string;
  name: string;
  perspective: string;
  maxTurns?: number;
  model?: string;
};

export type ReviewAgentSpec = {
  version: number;
  agents: ReviewAgent[];
  debate_rounds?: number;
  synthesis?: {
    perspective?: string;
  };
};

export const DEFAULT_AGENTS: ReviewAgent[] = [
  {
    id: "critic",
    name: "Critic Reviewer",
    perspective: [
      "You are a Critic Reviewer. Focus on:",
      "- Whether the changes are appropriate and necessary",
      "- Pattern consistency with the existing codebase",
      "- Edge cases and fallback handling",
      "- Whether the changes could introduce regressions",
      "- Architectural fit with the project's design patterns",
    ].join("\n"),
    maxTurns: undefined,
  },
  {
    id: "code-quality",
    name: "Code Quality Reviewer",
    perspective: [
      "You are a Code Quality Reviewer. Focus on:",
      "- YAGNI, DRY, and SOLID principles",
      "- Error handling completeness and correctness",
      "- Type safety and type design",
      "- Unnecessary complexity or over-engineering",
      "- Resource management and potential leaks",
    ].join("\n"),
    maxTurns: undefined,
  },
  {
    id: "convention",
    name: "Convention Reviewer",
    perspective: [
      "You are a Convention Reviewer. Focus on:",
      "- Naming conventions consistency",
      "- Import ordering and organization",
      "- Code style adherence to project standards",
      "- Documentation and comment quality where present",
      "- API surface consistency",
    ].join("\n"),
    maxTurns: undefined,
  },
];

const DEFAULT_SYNTHESIS_PERSPECTIVE = [
  "You are the Synthesis Reviewer. Your job is to:",
  "- Consolidate all findings from the review agents and their debate",
  "- Remove duplicates and merge overlapping findings",
  "- Organize findings by severity (critical > warning > suggestion > nitpick)",
  "- Present a clear, actionable final review",
  "- Highlight areas of agreement and disagreement between reviewers",
  "- Provide an overall assessment of the PR's readiness",
].join("\n");

const AGENT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const MAX_TURNS_LIMIT = 50;
const MAX_DEBATE_ROUNDS = 3;

function safePositiveInt(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
}

function normalizeAgent(raw: Record<string, unknown>): ReviewAgent {
  const id = String(raw.id || "");
  if (!id) {
    throw new Error("Review agent spec: each agent must have an 'id' field");
  }
  if (!AGENT_ID_PATTERN.test(id)) {
    throw new Error(
      `Review agent spec: agent id '${id}' must match ${AGENT_ID_PATTERN}`,
    );
  }
  return {
    id,
    name: String(raw.name || id),
    perspective: String(raw.perspective || ""),
    maxTurns:
      raw.max_turns || raw.maxTurns
        ? Math.min(
            safePositiveInt(raw.max_turns || raw.maxTurns, 10),
            MAX_TURNS_LIMIT,
          )
        : undefined,
    model: raw.model ? String(raw.model) : undefined,
  };
}

export async function loadAgentSpec(
  specPath: string,
): Promise<ReviewAgentSpec | null> {
  if (!existsSync(specPath)) {
    return null;
  }

  try {
    const content = await readFile(specPath, "utf-8");
    const parsed = parseYaml(content) as Record<string, unknown>;

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid YAML: expected an object");
    }

    const rawAgents = parsed.agents;
    if (!Array.isArray(rawAgents) || rawAgents.length === 0) {
      throw new Error("Invalid spec: 'agents' must be a non-empty array");
    }

    const agents = rawAgents.map(normalizeAgent);
    const synthesis = parsed.synthesis as { perspective?: string } | undefined;

    return {
      version: Number(parsed.version || 1),
      agents,
      debate_rounds:
        parsed.debate_rounds !== undefined
          ? Math.min(
              safePositiveInt(parsed.debate_rounds, 1),
              MAX_DEBATE_ROUNDS,
            )
          : undefined,
      synthesis: synthesis?.perspective ? synthesis : undefined,
    };
  } catch (error) {
    core.warning(`Failed to parse review agents spec at ${specPath}: ${error}`);
    return null;
  }
}

export async function resolveAgents(inputs: {
  reviewProtocolPath?: string;
  reviewAgents?: string;
  reviewDebateRounds: number;
  reviewMaxAgents: number;
}): Promise<{
  agents: ReviewAgent[];
  debateRounds: number;
  synthesisPerspective: string;
}> {
  const workspaceDir = process.env.GITHUB_WORKSPACE || process.cwd();

  // Priority 1: Explicit protocol path
  if (inputs.reviewProtocolPath) {
    const spec = await loadAgentSpec(inputs.reviewProtocolPath);
    if (spec) {
      core.info(
        `Loaded ${spec.agents.length} agents from ${inputs.reviewProtocolPath}`,
      );
      return {
        agents: spec.agents.slice(0, inputs.reviewMaxAgents),
        debateRounds: spec.debate_rounds ?? inputs.reviewDebateRounds,
        synthesisPerspective:
          spec.synthesis?.perspective || DEFAULT_SYNTHESIS_PERSPECTIVE,
      };
    }
    core.warning(
      `Spec file not found at ${inputs.reviewProtocolPath}, falling back`,
    );
  }

  // Priority 2: .claude/review-agents.yml in repo
  const defaultSpecPath = `${workspaceDir}/.claude/review-agents.yml`;
  const spec = await loadAgentSpec(defaultSpecPath);
  if (spec) {
    core.info(`Loaded ${spec.agents.length} agents from ${defaultSpecPath}`);
    return {
      agents: spec.agents.slice(0, inputs.reviewMaxAgents),
      debateRounds: spec.debate_rounds ?? inputs.reviewDebateRounds,
      synthesisPerspective:
        spec.synthesis?.perspective || DEFAULT_SYNTHESIS_PERSPECTIVE,
    };
  }

  // Priority 3: review_agents action input (JSON)
  if (inputs.reviewAgents) {
    try {
      const rawAgents = JSON.parse(inputs.reviewAgents) as Record<
        string,
        unknown
      >[];
      const agents = rawAgents.map(normalizeAgent);
      core.info(`Loaded ${agents.length} agents from review_agents input`);
      return {
        agents: agents.slice(0, inputs.reviewMaxAgents),
        debateRounds: inputs.reviewDebateRounds,
        synthesisPerspective: DEFAULT_SYNTHESIS_PERSPECTIVE,
      };
    } catch (error) {
      core.warning(`Failed to parse review_agents JSON input: ${error}`);
    }
  }

  // Priority 4: Default agents
  core.info("Using default review agents (critic, code-quality, convention)");
  return {
    agents: DEFAULT_AGENTS.slice(0, inputs.reviewMaxAgents),
    debateRounds: inputs.reviewDebateRounds,
    synthesisPerspective: DEFAULT_SYNTHESIS_PERSPECTIVE,
  };
}
