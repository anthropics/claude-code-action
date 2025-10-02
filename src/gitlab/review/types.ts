export type ReviewFinding = {
  path: string;
  line?: number;
  severity: "suggestion" | "issue" | "critical";
  title: string;
  summary: string;
  suggestion?: string;
};

export type ReviewSummary = {
  highLevelSummary: string;
  testingGuidance?: string;
  risks?: string[];
};

export type ReviewResult = {
  findings: ReviewFinding[];
  summary: ReviewSummary;
};

