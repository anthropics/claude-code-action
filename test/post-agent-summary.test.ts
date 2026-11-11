import { describe, expect, test } from "bun:test";
import type { Octokits } from "../src/github/api/client";
import type { Turn } from "../src/entrypoints/format-turns";
import { postAgentSummaryComment } from "../src/entrypoints/post-agent-summary";

const SUMMARY_MARKER = "<!-- claude-code-action:agent-summary -->";

function makeContext() {
  return {
    repository: { owner: "anthropics", repo: "claude-code-action" },
    entityNumber: 123,
    runId: "456",
  };
}

function makeOctokit(comments: Array<{ id: number; body?: string }> = []) {
  const calls = {
    paginationParams: [] as Array<Record<string, unknown>>,
    created: [] as Array<Record<string, unknown>>,
    updated: [] as Array<Record<string, unknown>>,
  };

  const octokit = {
    rest: {
      paginate: async (_method: unknown, params: Record<string, unknown>) => {
        calls.paginationParams.push(params);
        return comments;
      },
      issues: {
        listComments: async () => ({ data: comments.slice(0, 30) }),
        createComment: async (params: Record<string, unknown>) => {
          calls.created.push(params);
          return { data: { id: 999 } };
        },
        updateComment: async (params: Record<string, unknown>) => {
          calls.updated.push(params);
          return { data: { id: params.comment_id } };
        },
      },
    },
  } as unknown as Octokits;

  return { octokit, calls };
}

describe("postAgentSummaryComment", () => {
  test("posts the latest successful response with sanitization and a run link", async () => {
    const { octokit, calls } = makeOctokit();
    const turns: Turn[] = [
      { type: "result", subtype: "success", result: "Older response" },
      {
        type: "result",
        subtype: "success",
        result:
          "Final response <!-- hidden --> ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
      },
    ];

    const result = await postAgentSummaryComment(
      turns,
      makeContext(),
      octokit,
      "https://github.example/",
    );

    expect(result).toBe("created");
    expect(calls.paginationParams).toEqual([
      {
        owner: "anthropics",
        repo: "claude-code-action",
        issue_number: 123,
        per_page: 100,
      },
    ]);
    expect(calls.created).toHaveLength(1);
    const body = String(calls.created[0]?.body);
    expect(body).toContain(SUMMARY_MARKER);
    expect(body).toContain("Final response");
    expect(body).toContain("[REDACTED_GITHUB_TOKEN]");
    expect(body).not.toContain("Older response");
    expect(body).not.toContain("<!-- hidden -->");
    expect(body).toContain(
      "https://github.example/anthropics/claude-code-action/actions/runs/456",
    );
  });

  test("updates the existing summary comment found after the first comments page", async () => {
    const comments = Array.from({ length: 35 }, (_, index) => ({
      id: index + 1,
      body: `Regular comment ${index + 1}`,
    }));
    comments[32] = { id: 33, body: `${SUMMARY_MARKER}\n\nPrevious response` };
    const { octokit, calls } = makeOctokit(comments);

    const result = await postAgentSummaryComment(
      [{ type: "result", subtype: "success", result: "Updated response" }],
      makeContext(),
      octokit,
    );

    expect(result).toBe("updated");
    expect(calls.updated).toHaveLength(1);
    expect(calls.updated[0]).toMatchObject({
      owner: "anthropics",
      repo: "claude-code-action",
      comment_id: 33,
    });
    expect(calls.created).toHaveLength(0);
    expect(String(calls.updated[0]?.body)).toContain("Updated response");
  });

  test("skips empty and unsuccessful final results", async () => {
    for (const turns of [
      [{ type: "result", subtype: "success", result: "" }],
      [
        { type: "result", subtype: "success", result: "Old response" },
        { type: "result", subtype: "error", result: "Failed run" },
      ],
    ] as Turn[][]) {
      const { octokit, calls } = makeOctokit();
      const result = await postAgentSummaryComment(
        turns,
        makeContext(),
        octokit,
      );

      expect(result).toBe("skipped");
      expect(calls.paginationParams).toHaveLength(0);
      expect(calls.created).toHaveLength(0);
      expect(calls.updated).toHaveLength(0);
    }
  });

  test("keeps large comments within GitHub's body limit", async () => {
    const { octokit, calls } = makeOctokit();

    const result = await postAgentSummaryComment(
      [{ type: "result", subtype: "success", result: "x".repeat(70_000) }],
      makeContext(),
      octokit,
    );

    expect(result).toBe("created");
    const body = String(calls.created[0]?.body);
    expect(body.length).toBeLessThanOrEqual(60_000);
    expect(body).toContain("_(Summary truncated.)_");
  });
});
