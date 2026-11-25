import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("file operations send repository-relative Git paths to the Trees API", async () => {
  const repoDir = await mkdtemp(join(tmpdir(), "file-ops-paths-"));
  type TreeEntry = { path: string; sha?: string | null; content?: string };
  const trees: TreeEntry[][] = [];
  const paths = ["src/example.txt"];
  if (process.platform !== "win32") paths.push("src/literal\\name.txt");
  const api = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path.endsWith("/git/ref/heads/feature")) {
        return Response.json({ object: { sha: "base-commit" } });
      }
      if (path.endsWith("/git/commits/base-commit")) {
        return Response.json({ tree: { sha: "base-tree" } });
      }
      if (path.endsWith("/git/trees")) {
        const body = (await request.json()) as { tree: TreeEntry[] };
        trees.push(body.tree);
        return Response.json({ sha: "new-tree" });
      }
      if (path.endsWith("/git/commits")) {
        return Response.json({
          sha: "new-commit",
          message: "Update files",
          author: { name: "Test", date: "2026-01-01T00:00:00Z" },
        });
      }
      if (path.endsWith("/git/refs/heads/feature")) {
        return Response.json({ object: { sha: "new-commit" } });
      }
      return new Response("Unexpected request", { status: 404 });
    },
  });
  const client = new Client({ name: "file-ops-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(import.meta.dir, "../src/mcp/github-file-ops-server.ts")],
    env: {
      REPO_OWNER: "owner",
      REPO_NAME: "repo",
      BRANCH_NAME: "feature",
      REPO_DIR: repoDir,
      GITHUB_TOKEN: "test-token",
      GITHUB_API_URL: api.url.toString().replace(/\/$/, ""),
    },
    stderr: "pipe",
  });

  try {
    await mkdir(join(repoDir, "src"));
    for (const path of paths) {
      await writeFile(join(repoDir, path), "updated content");
    }
    await client.connect(transport);
    const committed = await client.callTool({
      name: "commit_files",
      arguments: {
        files: paths.map((path) => join(repoDir, path)),
        message: "Update files",
      },
    });
    expect(committed.isError).not.toBe(true);
    const deleted = await client.callTool({
      name: "delete_files",
      arguments: { paths, message: "Delete files" },
    });
    expect(deleted.isError).not.toBe(true);
    expect(trees).toHaveLength(2);
    expect(trees[0]).toEqual(
      paths.map((path) =>
        expect.objectContaining({ path, content: "updated content" }),
      ),
    );
    expect(trees[1]).toEqual(
      paths.map((path) => expect.objectContaining({ path, sha: null })),
    );
  } finally {
    await client.close();
    await transport.close();
    api.stop(true);
    await rm(repoDir, { recursive: true, force: true });
  }
});
