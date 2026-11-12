import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("commit_files rejects a mixed batch containing a Git LFS file before making API requests", async () => {
  const repoDir = await mkdtemp(join(tmpdir(), "claude-lfs-test-"));
  const requests: string[] = [];
  const api = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      requests.push(`${request.method} ${path}`);
      switch (path) {
        case "/repos/test/repo/git/ref/heads/work":
          return Response.json({ object: { sha: "base" } });
        case "/repos/test/repo/git/commits/base":
          return Response.json({ tree: { sha: "base-tree" } });
        case "/repos/test/repo/git/trees":
          return Response.json({ sha: "new-tree" });
        case "/repos/test/repo/git/commits":
          return Response.json({
            sha: "new",
            author: { name: "Fixture", date: "2026-11-12" },
          });
        case "/repos/test/repo/git/refs/heads/work":
          return Response.json({});
        default:
          return new Response(null, { status: 404 });
      }
    },
  });
  const client = new Client({ name: "file-ops-test", version: "1.0.0" });

  try {
    execFileSync("git", ["init", "--quiet"], { cwd: repoDir });
    await mkdir(join(repoDir, "data"));
    await writeFile(join(repoDir, ".gitattributes"), "*.csv filter=lfs\n");
    await writeFile(
      join(repoDir, "data", ".gitattributes"),
      "preview.csv -filter\n",
    );
    await writeFile(join(repoDir, "data", "large asset.csv"), "a,b\n");
    await writeFile(join(repoDir, "data", "preview.csv"), "c,d\n");
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [join(import.meta.dir, "../src/mcp/github-file-ops-server.ts")],
        cwd: repoDir,
        env: {
          GITHUB_API_URL: api.url.origin,
          GITHUB_TOKEN: "fixture-token",
          REPO_DIR: repoDir,
          REPO_OWNER: "test",
          REPO_NAME: "repo",
          BRANCH_NAME: "work",
        },
      }),
    );

    const rejected = await client.callTool({
      name: "commit_files",
      arguments: {
        files: ["data/preview.csv", "data/large asset.csv"],
        message: "Update CSV files",
      },
    });
    expect(rejected.isError).toBe(true);
    expect(rejected.content).toEqual([
      { type: "text", text: expect.stringContaining('"data/large asset.csv"') },
    ]);
    expect(requests).toEqual([]);

    execFileSync("git", ["add", ".gitattributes", "data/.gitattributes"], {
      cwd: repoDir,
    });
    await writeFile(join(repoDir, ".gitattributes"), "*.csv -filter\n");
    const indexedLfsFile = await client.callTool({
      name: "commit_files",
      arguments: {
        files: ["data/large asset.csv"],
        message: "Update the asset without committing the attribute change",
      },
    });
    expect(indexedLfsFile.isError).toBe(true);
    expect(requests).toEqual([]);

    const ordinary = await client.callTool({
      name: "commit_files",
      arguments: { files: ["data/preview.csv"], message: "Update preview" },
    });
    expect(ordinary.isError).toBeFalsy();
    expect(requests).toContain("PATCH /repos/test/repo/git/refs/heads/work");

    await rename(join(repoDir, ".git"), join(repoDir, "saved-git-dir"));
    requests.length = 0;
    const withoutCheckout = await client.callTool({
      name: "commit_files",
      arguments: {
        files: ["data/preview.csv"],
        message: "Commit generated CSV",
      },
    });
    expect(withoutCheckout.isError).toBeFalsy();
    expect(requests).toContain("PATCH /repos/test/repo/git/refs/heads/work");
  } finally {
    await client.close();
    await api.stop(true);
    await rm(repoDir, { recursive: true, force: true });
  }
});
