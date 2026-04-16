export const AGENT_FINDINGS_SCHEMA = {
  type: "object",
  properties: {
    agent_id: { type: "string" },
    agent_name: { type: "string" },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: {
            type: "string",
            enum: ["critical", "warning", "suggestion", "nitpick"],
          },
          category: { type: "string" },
          file: { type: "string" },
          line: { type: "number" },
          title: { type: "string" },
          description: { type: "string" },
          suggestion: { type: "string" },
        },
        required: ["severity", "title", "description"],
      },
    },
    overall_assessment: { type: "string" },
  },
  required: ["agent_id", "agent_name", "summary", "findings"],
} as const;

export const AGENT_REBUTTAL_SCHEMA = {
  type: "object",
  properties: {
    agent_id: { type: "string" },
    agent_name: { type: "string" },
    responses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          regarding_agent_id: { type: "string" },
          regarding_finding_title: { type: "string" },
          stance: {
            type: "string",
            enum: ["agree", "disagree", "partially_agree", "supplement"],
          },
          reasoning: { type: "string" },
          additional_context: { type: "string" },
        },
        required: [
          "regarding_agent_id",
          "regarding_finding_title",
          "stance",
          "reasoning",
        ],
      },
    },
    revised_findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: {
            type: "string",
            enum: ["critical", "warning", "suggestion", "nitpick"],
          },
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["severity", "title", "description"],
      },
    },
  },
  required: ["agent_id", "agent_name", "responses"],
} as const;

export type AgentFinding = {
  severity: "critical" | "warning" | "suggestion" | "nitpick";
  category?: string;
  file?: string;
  line?: number;
  title: string;
  description: string;
  suggestion?: string;
};

export type AgentFindings = {
  agent_id: string;
  agent_name: string;
  summary: string;
  findings: AgentFinding[];
  overall_assessment?: string;
};

export type AgentRebuttalResponse = {
  regarding_agent_id: string;
  regarding_finding_title: string;
  stance: "agree" | "disagree" | "partially_agree" | "supplement";
  reasoning: string;
  additional_context?: string;
};

export type AgentRebuttal = {
  agent_id: string;
  agent_name: string;
  responses: AgentRebuttalResponse[];
  revised_findings?: AgentFinding[];
};
