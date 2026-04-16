import { describe, expect, it, beforeEach, mock } from "bun:test";
import { ReviewTracker } from "../../../src/modes/review/tracking";
import type { ReviewAgent } from "../../../src/modes/review/agents";
import type { AgentFindings } from "../../../src/modes/review/schemas";

describe("ReviewTracker", () => {
  const agents: ReviewAgent[] = [
    {
      id: "critic",
      name: "Critic Reviewer",
      perspective: "Focus on design",
      maxTurns: 10,
    },
    {
      id: "quality",
      name: "Quality Reviewer",
      perspective: "Focus on quality",
      maxTurns: 10,
    },
  ];

  let mockOctokit: any;
  let createCommentMock: ReturnType<typeof mock>;
  let updateCommentMock: ReturnType<typeof mock>;

  beforeEach(() => {
    createCommentMock = mock(() => Promise.resolve({ data: { id: 12345 } }));
    updateCommentMock = mock(() => Promise.resolve({}));
    mockOctokit = {
      issues: {
        createComment: createCommentMock,
        updateComment: updateCommentMock,
      },
    };
  });

  it("should create a tracking comment with all agents in pending state", async () => {
    const tracker = new ReviewTracker(
      mockOctokit,
      "test-owner",
      "test-repo",
      agents,
    );

    const commentId = await tracker.createComment(42);

    expect(commentId).toBe(12345);
    expect(createCommentMock).toHaveBeenCalledTimes(1);

    const call = createCommentMock.mock.calls[0]![0];
    expect(call.owner).toBe("test-owner");
    expect(call.repo).toBe("test-repo");
    expect(call.issue_number).toBe(42);
    expect(call.body).toContain("Critic Reviewer");
    expect(call.body).toContain("Quality Reviewer");
    expect(call.body).toContain("⬜");
    expect(call.body).toContain("Multi-Agent Peer Review");
  });

  it("should update agent status to running", async () => {
    const tracker = new ReviewTracker(
      mockOctokit,
      "test-owner",
      "test-repo",
      agents,
    );
    await tracker.createComment(42);

    await tracker.updateAgentStatus("Critic Reviewer", "running");

    expect(updateCommentMock).toHaveBeenCalledTimes(1);
    const body = updateCommentMock.mock.calls[0]![0].body;
    expect(body).toContain("⏳");
    expect(body).toContain("Running");
  });

  it("should update agent status with findings count", async () => {
    const tracker = new ReviewTracker(
      mockOctokit,
      "test-owner",
      "test-repo",
      agents,
    );
    await tracker.createComment(42);

    const findings: AgentFindings = {
      agent_id: "critic",
      agent_name: "Critic Reviewer",
      summary: "Found issues",
      findings: [
        {
          severity: "critical",
          title: "Bug",
          description: "A bug",
        },
        {
          severity: "critical",
          title: "Bug 2",
          description: "Another bug",
        },
        {
          severity: "warning",
          title: "Warning",
          description: "A warning",
        },
      ],
    };

    await tracker.updateAgentStatus("Critic Reviewer", "complete", findings);

    const body = updateCommentMock.mock.calls[0]![0].body;
    expect(body).toContain("✅");
    expect(body).toContain("2 critical");
    expect(body).toContain("1 warning");
  });

  it("should update debate status", async () => {
    const tracker = new ReviewTracker(
      mockOctokit,
      "test-owner",
      "test-repo",
      agents,
    );
    await tracker.createComment(42);

    await tracker.updateDebateStatus("running");
    let body = updateCommentMock.mock.calls[0]![0].body;
    expect(body).toContain("Debate Round");
    expect(body).toContain("⏳");

    await tracker.updateDebateStatus("complete");
    body = updateCommentMock.mock.calls[1]![0].body;
    expect(body).toContain("✅");
  });

  it("should update synthesis status", async () => {
    const tracker = new ReviewTracker(
      mockOctokit,
      "test-owner",
      "test-repo",
      agents,
    );
    await tracker.createComment(42);

    await tracker.updateSynthesisStatus("complete");

    const body = updateCommentMock.mock.calls[0]![0].body;
    expect(body).toContain("Synthesis");
    expect(body).toContain("✅");
  });

  it("should not call updateComment if comment was not created", async () => {
    const tracker = new ReviewTracker(
      mockOctokit,
      "test-owner",
      "test-repo",
      agents,
    );

    // Don't call createComment — update should be a no-op
    await tracker.updateAgentStatus("Critic Reviewer", "running");

    expect(updateCommentMock).not.toHaveBeenCalled();
  });

  it("should show error status icon", async () => {
    const tracker = new ReviewTracker(
      mockOctokit,
      "test-owner",
      "test-repo",
      agents,
    );
    await tracker.createComment(42);

    await tracker.updateAgentStatus("Critic Reviewer", "error");

    const body = updateCommentMock.mock.calls[0]![0].body;
    expect(body).toContain("❌");
    expect(body).toContain("Error");
  });
});
