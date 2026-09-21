#!/usr/bin/env bun

import { describe, expect, test, beforeAll } from "bun:test";
import { generatePrompt } from "../src/create-prompt";
import type { PreparedContext } from "../src/create-prompt";
import {
  commitFilesPayloadSchema,
  deleteFilesPayloadSchema,
} from "../src/mcp/github-file-ops-schemas";

beforeAll(() => {
  process.env.GITHUB_ACTION_PATH = "/test/action/path";
});

const mockGitHubData = {
  contextData: {
    title: "Test PR",
    body: "This is a test PR",
    author: { login: "testuser" },
    state: "OPEN",
    labels: { nodes: [] },
    createdAt: "2023-01-01T00:00:00Z",
    additions: 15,
    deletions: 5,
    baseRefName: "main",
    headRefName: "feature-branch",
    headRefOid: "abc123",
    isCrossRepository: false,
    headRepository: { owner: { login: "testowner" }, name: "testrepo" },
    commits: { totalCount: 0, nodes: [] },
    files: { nodes: [] },
    comments: { nodes: [] },
    reviews: { nodes: [] },
  },
  comments: [],
  changedFiles: [],
  changedFilesWithSHA: [],
  reviewData: null,
  imageUrlMap: new Map<string, string>(),
};

const signingContext: PreparedContext = {
  repository: "owner/repo",
  claudeCommentId: "12345",
  triggerPhrase: "@claude",
  eventData: {
    eventName: "issue_comment",
    commentId: "67890",
    isPR: true,
    prNumber: "123",
    commentBody: "@claude delete the old file",
  },
};

function extractToolExample(
  prompt: string,
  tool: string,
): Record<string, unknown> {
  const match = prompt.match(
    new RegExp(
      `${tool.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*(\\{[^}]+\\})`,
    ),
  );
  if (!match) {
    throw new Error(`No JSON example for ${tool} in prompt`);
  }
  return JSON.parse(match[1] as string);
}

describe("delete_files prompt vs live MCP schema (#1665)", () => {
  test("the payload the old prompt taught is rejected by the tool schema", () => {
    const taughtByOldPrompt = {
      files: ["path/to/old.js"],
      message: "chore: remove deprecated file",
    };
    const result = deleteFilesPayloadSchema.safeParse(taughtByOldPrompt);
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((issue) => issue.path.join("."));
      expect(fields).toContain("paths");
    }
  });

  test("the payload the new prompt teaches is accepted by the tool schema", () => {
    const taughtByNewPrompt = {
      paths: ["path/to/old.js"],
      message: "chore: remove deprecated file",
    };
    const result = deleteFilesPayloadSchema.safeParse(taughtByNewPrompt);
    expect(result.success).toBe(true);
  });

  test("generated tag-mode prompt example parses against the live schema", async () => {
    const prompt = await generatePrompt(
      signingContext,
      mockGitHubData,
      true,
      "tag",
    );
    const example = extractToolExample(
      prompt,
      "mcp__github_file_ops__delete_files",
    );
    expect(example).toHaveProperty("paths");
    expect(example).not.toHaveProperty("files");
    const result = deleteFilesPayloadSchema.safeParse(example);
    expect(result.success).toBe(true);
  });

  test("rejects paths when the value is a string instead of an array", () => {
    const result = deleteFilesPayloadSchema.safeParse({
      paths: "path/to/old.js",
      message: "chore: remove deprecated file",
    });
    expect(result.success).toBe(false);
  });

  test("rejects a payload that has paths but omits message", () => {
    const result = deleteFilesPayloadSchema.safeParse({
      paths: ["path/to/old.js"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.map((issue) => issue.path.join(".")),
      ).toContain("message");
    }
  });

  test("accepts a payload that still includes the old files key beside paths", () => {
    const result = deleteFilesPayloadSchema.safeParse({
      files: ["path/to/old.js"],
      paths: ["path/to/old.js"],
      message: "chore: remove deprecated file",
    });
    expect(result.success).toBe(true);
  });

  test("does not change commit_files — that sibling tool still requires files", async () => {
    const prompt = await generatePrompt(
      signingContext,
      mockGitHubData,
      true,
      "tag",
    );
    const example = extractToolExample(
      prompt,
      "mcp__github_file_ops__commit_files",
    );
    expect(example).toHaveProperty("files");
    expect(example).not.toHaveProperty("paths");
    expect(commitFilesPayloadSchema.safeParse(example).success).toBe(true);
    expect(deleteFilesPayloadSchema.safeParse(example).success).toBe(false);
  });

  test("generated delete_files example keys are exactly paths and message", async () => {
    const prompt = await generatePrompt(
      signingContext,
      mockGitHubData,
      true,
      "tag",
    );
    const example = extractToolExample(
      prompt,
      "mcp__github_file_ops__delete_files",
    );
    expect(Object.keys(example).sort()).toEqual(["message", "paths"]);
  });
});
