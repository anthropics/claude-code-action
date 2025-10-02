import { describe, expect, it } from "vitest";
import { createPrompt } from "../src/gitlab/prompt";
import type { MergeRequestContext } from "../src/gitlab/context/types";

function buildContext(): MergeRequestContext {
  return {
    iid: "1",
    project: {
      id: 1,
      path_with_namespace: "example/project",
      default_branch: "main",
    },
    mergeRequest: {
      iid: 1,
      title: "Update feature",
      description: "",
      author: { id: 1, username: "alice", name: "Alice" },
      source_branch: "feature",
      target_branch: "main",
      web_url: "https://gitlab.com/example/project/-/merge_requests/1",
      diff_refs: {
        base_sha: "base",
        start_sha: "start",
        head_sha: "head",
      },
    },
    changes: [
      {
        new_path: "src/index.ts",
        old_path: "src/index.ts",
        diff: "@@ -1 +1 @@\n-console.log('old');\n+console.log('new');",
        new_file: false,
        renamed_file: false,
        deleted_file: false,
      },
    ],
    discussions: [],
  };
}

describe("createPrompt", () => {
  it("generates system and user prompts", () => {
    const context = buildContext();
    const prompt = createPrompt({ context });

    expect(prompt.systemPrompt).toContain("Claude");
    expect(prompt.userPrompt).toContain("Changed files");
    expect(prompt.userPrompt).toContain("src/index.ts");
  });
});

