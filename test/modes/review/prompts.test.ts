import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { readFile, rm, mkdir } from "fs/promises";
import { existsSync } from "fs";
import type { ReviewAgent } from "../../../src/modes/review/agents";
import type {
  AgentFindings,
  AgentRebuttal,
} from "../../../src/modes/review/schemas";
import {
  generateAgentPrompt,
  generateDebatePrompt,
  generateSynthesisPrompt,
  buildAgentClaudeArgs,
} from "../../../src/modes/review/prompts";
import { AGENT_FINDINGS_SCHEMA } from "../../../src/modes/review/schemas";

describe("review prompts", () => {
  const originalRunnerTemp = process.env.RUNNER_TEMP;
  let promptDir: string;

  beforeEach(async () => {
    process.env.RUNNER_TEMP = `/tmp/test-prompts-${Date.now()}`;
    promptDir = `${process.env.RUNNER_TEMP}/claude-prompts`;
    await mkdir(promptDir, { recursive: true });
  });

  afterEach(async () => {
    if (process.env.RUNNER_TEMP) {
      await rm(process.env.RUNNER_TEMP, { recursive: true, force: true });
    }
    process.env.RUNNER_TEMP = originalRunnerTemp;
  });

  const mockAgent: ReviewAgent = {
    id: "test-agent",
    name: "Test Agent",
    perspective: "You are a test reviewer. Focus on testing.",
    maxTurns: 10,
  };

  const mockGitHubContext = `## Repository
test-owner/test-repo

## PR Context
Title: Fix a bug`;

  describe("generateAgentPrompt", () => {
    it("should create a prompt file with agent perspective and GitHub context", async () => {
      const promptPath = await generateAgentPrompt(
        mockAgent,
        mockGitHubContext,
      );

      expect(existsSync(promptPath)).toBe(true);
      expect(promptPath).toContain("review-agent-test-agent.txt");

      const content = await readFile(promptPath, "utf-8");
      expect(content).toContain("You are a test reviewer. Focus on testing.");
      expect(content).toContain("test-owner/test-repo");
      expect(content).toContain("Fix a bug");
      expect(content).toContain("structured JSON output");
    });
  });

  describe("generateDebatePrompt", () => {
    const ownFindings: AgentFindings = {
      agent_id: "test-agent",
      agent_name: "Test Agent",
      summary: "Found some issues",
      findings: [
        {
          severity: "warning",
          title: "Missing error handling",
          description: "No try/catch in async function",
          file: "src/main.ts",
          line: 42,
        },
      ],
    };

    const otherFindings: AgentFindings[] = [
      {
        agent_id: "other-agent",
        agent_name: "Other Agent",
        summary: "Found different issues",
        findings: [
          {
            severity: "critical",
            title: "SQL injection",
            description: "User input not sanitized",
            file: "src/db.ts",
            line: 10,
          },
        ],
      },
    ];

    it("should create a debate prompt with own and other findings", async () => {
      const promptPath = await generateDebatePrompt(
        mockAgent,
        ownFindings,
        otherFindings,
      );

      expect(existsSync(promptPath)).toBe(true);
      expect(promptPath).toContain("review-debate-test-agent.txt");

      const content = await readFile(promptPath, "utf-8");
      expect(content).toContain("You are a test reviewer");
      expect(content).toContain("Missing error handling");
      expect(content).toContain("SQL injection");
      expect(content).toContain("Other Agent");
      expect(content).toContain("agree, disagree, partially agree");
    });

    it("should include file and line references from other findings", async () => {
      const promptPath = await generateDebatePrompt(
        mockAgent,
        ownFindings,
        otherFindings,
      );

      const content = await readFile(promptPath, "utf-8");
      expect(content).toContain("src/db.ts:10");
    });
  });

  describe("generateSynthesisPrompt", () => {
    const allFindings: AgentFindings[] = [
      {
        agent_id: "critic",
        agent_name: "Critic",
        summary: "Several issues found",
        findings: [
          {
            severity: "critical",
            title: "Race condition",
            description: "Concurrent access issue",
          },
        ],
        overall_assessment: "Needs work",
      },
    ];

    const allRebuttals: AgentRebuttal[] = [
      {
        agent_id: "quality",
        agent_name: "Quality",
        responses: [
          {
            regarding_agent_id: "critic",
            regarding_finding_title: "Race condition",
            stance: "agree",
            reasoning: "Confirmed the race condition exists",
          },
        ],
      },
    ];

    it("should create synthesis prompt with all findings", async () => {
      const promptPath = await generateSynthesisPrompt(
        "Synthesize all findings",
        allFindings,
        allRebuttals,
      );

      expect(existsSync(promptPath)).toBe(true);

      const content = await readFile(promptPath, "utf-8");
      expect(content).toContain("Synthesize all findings");
      expect(content).toContain("Race condition");
      expect(content).toContain("Confirmed the race condition exists");
      expect(content).toContain("executive summary");
    });

    it("should handle empty rebuttals", async () => {
      const promptPath = await generateSynthesisPrompt(
        "Synthesize",
        allFindings,
        [],
      );

      const content = await readFile(promptPath, "utf-8");
      expect(content).toContain("Race condition");
      expect(content).not.toContain("Debate Round Results");
    });
  });

  describe("buildAgentClaudeArgs", () => {
    it("should append json-schema to base args", () => {
      const result = buildAgentClaudeArgs(
        "--permission-mode acceptEdits",
        AGENT_FINDINGS_SCHEMA,
      );

      expect(result).toContain("--permission-mode acceptEdits");
      expect(result).toContain("--json-schema");
      expect(result).toContain('"agent_id"');
    });

    it("should escape single quotes in schema", () => {
      // The schema itself shouldn't have single quotes, but the wrapping does
      const result = buildAgentClaudeArgs("", AGENT_FINDINGS_SCHEMA);
      expect(result).toContain("--json-schema '");
    });
  });
});
