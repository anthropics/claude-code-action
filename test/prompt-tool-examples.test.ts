#!/usr/bin/env bun

/**
 * Guards the tool-usage examples embedded in the tag-mode prompt against the
 * MCP tool schemas they describe.
 *
 * The prompt hard-codes JSON examples for tools whose schemas live in
 * src/mcp/, with nothing tying the two together. A parameter renamed on one
 * side leaves the other instructing Claude to make a call that fails zod
 * validation before the handler runs — which is how the delete_files example
 * came to document `files` while the schema declared `paths` (#1665).
 *
 * The schemas are read from source rather than imported: the MCP server
 * modules connect a stdio transport and call process.exit() at import time,
 * so importing one from a test would start a server.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { generatePrompt } from "../src/create-prompt";
import type { PreparedContext } from "../src/create-prompt";
import type { FetchDataResult } from "../src/github/data/fetcher";

beforeAll(() => {
  process.env.GITHUB_ACTION_PATH = "/test/action/path";
});

const fileOpsServerSource = readFileSync(
  new URL("../src/mcp/github-file-ops-server.ts", import.meta.url),
  "utf8",
);

/**
 * Map each `server.tool("name", ...)` registration to the parameter names in
 * its schema object. Parameters are the four-space-indented `key: z...`
 * entries between the tool name and the handler that follows it.
 */
function parseToolSchemas(source: string): Record<string, string[]> {
  const schemas: Record<string, string[]> = {};
  const registrations = [...source.matchAll(/server\.tool\(\s*"([^"]+)"/g)];

  registrations.forEach((match, index) => {
    const toolName = match[1]!;
    const start = match.index!;
    const nextStart = registrations[index + 1]?.index ?? source.length;
    // The schema object ends where the handler begins.
    const handlerAt = source.indexOf("async (", start);
    const end =
      handlerAt !== -1 && handlerAt < nextStart ? handlerAt : nextStart;
    const block = source.slice(start, end);

    schemas[toolName] = [...block.matchAll(/^ {4}(\w+): z\b/gm)].map(
      (param) => param[1]!,
    );
  });

  return schemas;
}

const toolSchemas = parseToolSchemas(fileOpsServerSource);

const mockGitHubData: FetchDataResult = {
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
    commits: { totalCount: 2, nodes: [] },
    files: { nodes: [] },
    comments: { nodes: [] },
    reviews: { nodes: [] },
  } as unknown as FetchDataResult["contextData"],
  comments: [],
  changedFiles: [],
  changedFilesWithSHA: [],
  reviewData: { nodes: [] },
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

/** Pull `mcp__github_file_ops__<tool>: {json}` examples out of the prompt. */
function extractToolExamples(
  prompt: string,
): Array<{ tool: string; args: Record<string, unknown> }> {
  return [...prompt.matchAll(/mcp__github_file_ops__(\w+): (\{.*\})/g)].map(
    (match) => ({
      tool: match[1]!,
      args: JSON.parse(match[2]!) as Record<string, unknown>,
    }),
  );
}

describe("github_file_ops tool schemas", () => {
  test("both tools are discovered with their parameters", () => {
    // Self-check: a regex that stopped matching would make the assertions
    // below vacuously pass.
    expect(toolSchemas.commit_files).toEqual(["files", "message"]);
    expect(toolSchemas.delete_files).toEqual(["paths", "message"]);
  });
});

describe("prompt tool-usage examples match the tool schemas", () => {
  test("commit-signing prompt documents both file ops tools", async () => {
    const prompt = await generatePrompt(
      signingContext,
      mockGitHubData,
      true,
      "tag",
    );
    const examples = extractToolExamples(prompt);

    expect(examples.map((e) => e.tool).sort()).toEqual([
      "commit_files",
      "delete_files",
    ]);
  });

  test("every documented parameter exists in the tool's schema", async () => {
    const prompt = await generatePrompt(
      signingContext,
      mockGitHubData,
      true,
      "tag",
    );

    for (const { tool, args } of extractToolExamples(prompt)) {
      const declared = toolSchemas[tool];
      expect(
        declared,
        `${tool} is not registered in the file ops server`,
      ).toBeDefined();

      const undeclared = Object.keys(args).filter(
        (k) => !declared!.includes(k),
      );
      expect(
        undeclared,
        `prompt documents ${tool} with parameter(s) the schema does not declare`,
      ).toEqual([]);
    }
  });

  test("delete_files is documented with paths, not files", async () => {
    // Regression pin for #1665 — `files` is commit_files' parameter, and the
    // delete_files example was written against that tool's shape.
    const prompt = await generatePrompt(
      signingContext,
      mockGitHubData,
      true,
      "tag",
    );

    expect(prompt).toContain(
      'mcp__github_file_ops__delete_files: {"paths": ["path/to/old.js"]',
    );
    expect(prompt).not.toContain(
      'mcp__github_file_ops__delete_files: {"files"',
    );
  });
});
