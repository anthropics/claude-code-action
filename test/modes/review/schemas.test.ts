import { describe, expect, it } from "bun:test";
import {
  AGENT_FINDINGS_SCHEMA,
  AGENT_REBUTTAL_SCHEMA,
} from "../../../src/modes/review/schemas";

describe("review schemas", () => {
  describe("AGENT_FINDINGS_SCHEMA", () => {
    it("should be a valid JSON Schema object", () => {
      expect(AGENT_FINDINGS_SCHEMA.type).toBe("object");
      expect(AGENT_FINDINGS_SCHEMA.properties).toBeDefined();
    });

    it("should require agent_id, agent_name, summary, and findings", () => {
      expect(AGENT_FINDINGS_SCHEMA.required).toEqual([
        "agent_id",
        "agent_name",
        "summary",
        "findings",
      ]);
    });

    it("should define findings as an array with severity enum", () => {
      const findings = AGENT_FINDINGS_SCHEMA.properties.findings;
      expect(findings.type).toBe("array");

      const item = findings.items;
      expect(item.properties.severity.enum).toEqual([
        "critical",
        "warning",
        "suggestion",
        "nitpick",
      ]);
    });

    it("should require severity, title, and description in findings items", () => {
      const item = AGENT_FINDINGS_SCHEMA.properties.findings.items;
      expect(item.required).toEqual(["severity", "title", "description"]);
    });

    it("should have optional file and line fields in findings", () => {
      const item = AGENT_FINDINGS_SCHEMA.properties.findings.items;
      expect(item.properties.file.type).toBe("string");
      expect(item.properties.line.type).toBe("number");
    });
  });

  describe("AGENT_REBUTTAL_SCHEMA", () => {
    it("should be a valid JSON Schema object", () => {
      expect(AGENT_REBUTTAL_SCHEMA.type).toBe("object");
      expect(AGENT_REBUTTAL_SCHEMA.properties).toBeDefined();
    });

    it("should require agent_id, agent_name, and responses", () => {
      expect(AGENT_REBUTTAL_SCHEMA.required).toEqual([
        "agent_id",
        "agent_name",
        "responses",
      ]);
    });

    it("should define stance enum in response items", () => {
      const item = AGENT_REBUTTAL_SCHEMA.properties.responses.items;
      expect(item.properties.stance.enum).toEqual([
        "agree",
        "disagree",
        "partially_agree",
        "supplement",
      ]);
    });

    it("should have optional revised_findings array", () => {
      expect(AGENT_REBUTTAL_SCHEMA.properties.revised_findings.type).toBe(
        "array",
      );
    });
  });
});
