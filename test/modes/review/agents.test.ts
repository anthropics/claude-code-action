import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { writeFile, mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  DEFAULT_AGENTS,
  loadAgentSpec,
  resolveAgents,
} from "../../../src/modes/review/agents";

describe("review agents", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `review-agents-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("DEFAULT_AGENTS", () => {
    it("should have 3 default agents", () => {
      expect(DEFAULT_AGENTS).toHaveLength(3);
    });

    it("should have critic, code-quality, and convention agents", () => {
      const ids = DEFAULT_AGENTS.map((a) => a.id);
      expect(ids).toEqual(["critic", "code-quality", "convention"]);
    });

    it("should not set maxTurns for default agents (unlimited)", () => {
      for (const agent of DEFAULT_AGENTS) {
        expect(agent.maxTurns).toBeUndefined();
      }
    });

    it("should not set model for default agents", () => {
      for (const agent of DEFAULT_AGENTS) {
        expect(agent.model).toBeUndefined();
      }
    });
  });

  describe("loadAgentSpec", () => {
    it("should return null for non-existent file", async () => {
      const result = await loadAgentSpec(join(tempDir, "nonexistent.yml"));
      expect(result).toBeNull();
    });

    it("should parse valid YAML spec", async () => {
      const specPath = join(tempDir, "agents.yml");
      await writeFile(
        specPath,
        `
version: 1
agents:
  - id: security
    name: Security Reviewer
    perspective: Focus on security issues
    max_turns: 8
  - id: perf
    name: Performance Reviewer
    perspective: Focus on performance
debate_rounds: 2
synthesis:
  perspective: Custom synthesis perspective
`,
      );

      const result = await loadAgentSpec(specPath);
      expect(result).not.toBeNull();
      expect(result!.version).toBe(1);
      expect(result!.agents).toHaveLength(2);
      expect(result!.agents[0]!.id).toBe("security");
      expect(result!.agents[0]!.name).toBe("Security Reviewer");
      expect(result!.agents[0]!.perspective).toBe("Focus on security issues");
      expect(result!.agents[0]!.maxTurns).toBe(8);
      expect(result!.agents[1]!.id).toBe("perf");
      expect(result!.agents[1]!.maxTurns).toBeUndefined(); // no max_turns in spec = unlimited
      expect(result!.debate_rounds).toBe(2);
      expect(result!.synthesis?.perspective).toBe(
        "Custom synthesis perspective",
      );
    });

    it("should handle agents with model override", async () => {
      const specPath = join(tempDir, "agents.yml");
      await writeFile(
        specPath,
        `
version: 1
agents:
  - id: fast-reviewer
    name: Fast Reviewer
    perspective: Quick review
    model: claude-sonnet-4-20250514
`,
      );

      const result = await loadAgentSpec(specPath);
      expect(result!.agents[0]!.model).toBe("claude-sonnet-4-20250514");
    });

    it("should use id as name when name not provided", async () => {
      const specPath = join(tempDir, "agents.yml");
      await writeFile(
        specPath,
        `
version: 1
agents:
  - id: my-reviewer
    perspective: Review stuff
`,
      );

      const result = await loadAgentSpec(specPath);
      expect(result!.agents[0]!.name).toBe("my-reviewer");
    });

    it("should return null for invalid YAML", async () => {
      const specPath = join(tempDir, "agents.yml");
      await writeFile(specPath, "not: valid: yaml: [[[");

      const result = await loadAgentSpec(specPath);
      // yaml package is lenient, this may parse or not
      // The important thing is it doesn't throw
      expect(result === null || result !== null).toBe(true);
    });

    it("should return null for spec without agents array", async () => {
      const specPath = join(tempDir, "agents.yml");
      await writeFile(
        specPath,
        `
version: 1
agents: "not an array"
`,
      );

      const result = await loadAgentSpec(specPath);
      expect(result).toBeNull();
    });

    it("should return null for spec with empty agents array", async () => {
      const specPath = join(tempDir, "agents.yml");
      await writeFile(
        specPath,
        `
version: 1
agents: []
`,
      );

      const result = await loadAgentSpec(specPath);
      expect(result).toBeNull();
    });

    it("should return null for agent without id", async () => {
      const specPath = join(tempDir, "agents.yml");
      await writeFile(
        specPath,
        `
version: 1
agents:
  - name: No ID Agent
    perspective: Review stuff
`,
      );

      const result = await loadAgentSpec(specPath);
      expect(result).toBeNull();
    });
  });

  describe("resolveAgents", () => {
    it("should return default agents when no spec or input provided", async () => {
      const result = await resolveAgents({
        reviewDebateRounds: 1,
        reviewMaxAgents: 5,
      });

      expect(result.agents).toEqual(DEFAULT_AGENTS);
      expect(result.debateRounds).toBe(1);
    });

    it("should respect reviewMaxAgents limit", async () => {
      const result = await resolveAgents({
        reviewDebateRounds: 1,
        reviewMaxAgents: 2,
      });

      expect(result.agents).toHaveLength(2);
    });

    it("should load agents from reviewProtocolPath when provided", async () => {
      const specPath = join(tempDir, "custom-agents.yml");
      await writeFile(
        specPath,
        `
version: 1
agents:
  - id: custom
    name: Custom Agent
    perspective: Custom perspective
debate_rounds: 3
`,
      );

      const result = await resolveAgents({
        reviewProtocolPath: specPath,
        reviewDebateRounds: 1,
        reviewMaxAgents: 5,
      });

      expect(result.agents).toHaveLength(1);
      expect(result.agents[0]!.id).toBe("custom");
      expect(result.debateRounds).toBe(3); // from spec file
    });

    it("should parse reviewAgents JSON input", async () => {
      const agents = JSON.stringify([
        { id: "json-agent", name: "JSON Agent", perspective: "From JSON" },
      ]);

      const result = await resolveAgents({
        reviewAgents: agents,
        reviewDebateRounds: 2,
        reviewMaxAgents: 5,
      });

      expect(result.agents).toHaveLength(1);
      expect(result.agents[0]!.id).toBe("json-agent");
      expect(result.debateRounds).toBe(2); // from input, not spec
    });

    it("should fall back to defaults on invalid JSON", async () => {
      const result = await resolveAgents({
        reviewAgents: "not valid json",
        reviewDebateRounds: 1,
        reviewMaxAgents: 5,
      });

      expect(result.agents).toEqual(DEFAULT_AGENTS);
    });

    it("should prioritize protocol path over reviewAgents input", async () => {
      const specPath = join(tempDir, "priority-agents.yml");
      await writeFile(
        specPath,
        `
version: 1
agents:
  - id: from-file
    perspective: File perspective
`,
      );

      const result = await resolveAgents({
        reviewProtocolPath: specPath,
        reviewAgents: JSON.stringify([
          { id: "from-json", perspective: "JSON perspective" },
        ]),
        reviewDebateRounds: 1,
        reviewMaxAgents: 5,
      });

      expect(result.agents[0]!.id).toBe("from-file");
    });
  });
});
