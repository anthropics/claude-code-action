import { describe, expect, it } from "vitest";
import { buildReviewMessages, parseReviewResponse } from "../src/gitlab/client/tooling";
import type { MergeRequestContext } from "../src/gitlab/context/types";

function sampleContext(): MergeRequestContext {
  return {
    iid: "7",
    project: {
      id: 7,
      path_with_namespace: "org/repo",
      default_branch: "main",
    },
    mergeRequest: {
      iid: 7,
      title: "Refactor logging",
      description: "",
      author: { id: 1, username: "bob", name: "Bob" },
      source_branch: "refactor",
      target_branch: "main",
      web_url: "https://gitlab.com/org/repo/-/merge_requests/7",
      diff_refs: {
        base_sha: "base",
        start_sha: "start",
        head_sha: "head",
      },
    },
    changes: [
      {
        new_path: "src/log.ts",
        old_path: "src/log.ts",
        diff: "@@ -1,2 +1,2 @@\n-console.log('a');\n+console.info('a');",
        new_file: false,
        renamed_file: false,
        deleted_file: false,
      },
    ],
    discussions: [],
  };
}

describe("buildReviewMessages", () => {
  it("includes diff content in user message", () => {
    const context = sampleContext();
    const prompt = {
      systemPrompt: "You are Claude",
      userPrompt: "Review",
    };

    const request = buildReviewMessages(context, prompt);

    expect(request.system).toBe(prompt.systemPrompt);
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0].content).toContain("src/log.ts");
    expect(request.messages[0].content).toContain("console.info");
  });
});

describe("parseReviewResponse", () => {
  it("parses valid JSON response", () => {
    const result = parseReviewResponse(
      JSON.stringify({
        findings: [
          {
            path: "src/log.ts",
            severity: "suggestion",
            title: "Use structured logging",
            summary: "Consider using structured logging",
          },
        ],
        summary: {
          highLevelSummary: "Looks good",
        },
      }),
    );

    expect(result.findings[0].path).toBe("src/log.ts");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseReviewResponse("not json")).toThrow();
  });
});

