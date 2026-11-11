import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Octokits } from "../src/github/api/client";
import type { Turn } from "../src/entrypoints/format-turns";
import { postAgentSummaryComment } from "../src/entrypoints/post-agent-summary";
import { createMockAutomationContext, createMockContext } from "./mockContext";

const SUMMARY_MARKER = "<!-- claude-code-action:agent-summary -->";
const prContext = createMockContext({
  repository: {
    owner: "anthropics",
    repo: "claude-code-action",
    full_name: "anthropics/claude-code-action",
  },
  eventName: "pull_request",
  entityNumber: 123,
  isPR: true,
  runId: "456",
});

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
        listComments: async () => ({ data: comments.slice(0, 100) }),
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
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agent-summary-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function postSummary(
    turns: Turn[],
    octokit: Octokits,
    overrides: Partial<Parameters<typeof postAgentSummaryComment>[0]> = {},
  ) {
    const executionFile = join(dir, "execution.json");
    writeFileSync(executionFile, JSON.stringify(turns));
    await postAgentSummaryComment({
      agentMode: true,
      enabled: true,
      claudeSuccess: true,
      context: prContext,
      executionFile,
      octokit,
      serverUrl: "https://github.example/",
      ...overrides,
    });
  }

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

    await postSummary(turns, octokit);

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

  test("updates the existing summary comment returned by the paginated lookup", async () => {
    const comments = Array.from({ length: 101 }, (_, index) => ({
      id: index + 1,
      body: `Regular comment ${index + 1}`,
    }));
    comments[100] = { id: 101, body: `${SUMMARY_MARKER}\n\nPrevious response` };
    const { octokit, calls } = makeOctokit(comments);

    await postSummary(
      [{ type: "result", subtype: "success", result: "Updated response" }],
      octokit,
    );

    expect(calls.updated).toHaveLength(1);
    expect(calls.updated[0]).toMatchObject({
      owner: "anthropics",
      repo: "claude-code-action",
      comment_id: 101,
    });
    expect(calls.created).toHaveLength(0);
    expect(String(calls.updated[0]?.body)).toContain("Updated response");
  });

  const missingSummaries: [string, Turn[]][] = [
    ["an empty result", [{ type: "result", subtype: "success", result: "" }]],
    ["a missing result field", [{ type: "result", subtype: "success" }]],
    ["no result event", [{ type: "assistant" }]],
    [
      "an unsuccessful final result",
      [
        { type: "result", subtype: "success", result: "Old response" },
        { type: "result", subtype: "error", result: "Failed run" },
      ],
    ],
  ];
  test.each(missingSummaries)("skips %s", async (_name, turns) => {
    const { octokit, calls } = makeOctokit();
    await postSummary(turns, octokit);
    expect(calls).toEqual({ paginationParams: [], created: [], updated: [] });
  });

  const ineligibleRuns: [
    string,
    Partial<Parameters<typeof postAgentSummaryComment>[0]>,
  ][] = [
    ["the run failed", { claudeSuccess: false }],
    [
      "the event is an issue",
      { context: createMockContext({ eventName: "issues" }) },
    ],
    [
      "the event is workflow_dispatch",
      { context: createMockAutomationContext() },
    ],
    ["tag mode is active", { agentMode: false }],
    ["the option is disabled", { enabled: false }],
  ];
  test.each(ineligibleRuns)(
    "skips a usable response when %s",
    async (_name, overrides) => {
      const { octokit, calls } = makeOctokit();
      await postSummary(
        [{ type: "result", subtype: "success", result: "Usable response" }],
        octokit,
        overrides,
      );
      expect(calls).toEqual({ paginationParams: [], created: [], updated: [] });
    },
  );

  test("keeps large comments within GitHub's body limit", async () => {
    const { octokit, calls } = makeOctokit();

    await postSummary(
      [{ type: "result", subtype: "success", result: "x".repeat(70_000) }],
      octokit,
    );

    expect(calls.created).toHaveLength(1);
    const body = String(calls.created[0]?.body);
    expect(body.length).toBeLessThanOrEqual(60_000);
    expect(body).toContain("_(Summary truncated.)_");
    expect(body).toEndWith(
      "[View workflow run](https://github.example/anthropics/claude-code-action/actions/runs/456)",
    );
  });
});
