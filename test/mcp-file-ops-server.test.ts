#!/usr/bin/env bun

/**
 * Tests for the github_file_ops MCP server — the tool Claude uses to commit and
 * delete files in the user's repository when commit signing is on. Until the
 * handlers were extracted this file had no coverage at all: the tool bodies
 * were anonymous callbacks inside top-level `server.tool()` calls, and the
 * module started a stdio server on import.
 *
 * node-fetch is mocked before the server is imported, so the real GitHub API is
 * never contacted and every request the handlers make can be inspected: the
 * call sequence, the tree entries, the file modes, and the retry behaviour.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";

type FetchCall = {
  url: string;
  method: string;
  body: any;
  headers: Record<string, string>;
};

type FakeResponse = { status: number; body?: unknown; text?: string };

let calls: FetchCall[] = [];
let respond: (call: FetchCall) => FakeResponse;

const fakeFetch = async (url: string, init?: any) => {
  const call: FetchCall = {
    url,
    method: init?.method ?? "GET",
    body: init?.body ? JSON.parse(init.body) : undefined,
    headers: init?.headers ?? {},
  };
  calls.push(call);

  const response = respond(call);
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    json: async () => response.body,
    text: async () => response.text ?? JSON.stringify(response.body ?? ""),
  };
};

mock.module("node-fetch", () => ({
  default: fakeFetch,
  __esModule: true,
}));

const {
  commitFiles,
  deleteFiles,
  getFileMode,
  getOrCreateBranchRef,
  readFileOpsContext,
  MISSING_REPO_ENV_MESSAGE,
} = await import("../src/mcp/github-file-ops-server");

const FAST_RETRY = { retry: { initialDelayMs: 1, maxDelayMs: 1 } };

/** Happy-path GitHub API: branch exists, every write succeeds. */
function happyPath(call: FetchCall): FakeResponse {
  if (call.method === "GET" && call.url.includes("/git/refs/heads/")) {
    return { status: 200, body: { object: { sha: "base-sha" } } };
  }
  if (call.method === "GET" && call.url.includes("/git/commits/")) {
    return { status: 200, body: { tree: { sha: "base-tree-sha" } } };
  }
  if (call.method === "POST" && call.url.endsWith("/git/blobs")) {
    return { status: 201, body: { sha: "blob-sha" } };
  }
  if (call.method === "POST" && call.url.endsWith("/git/trees")) {
    return { status: 201, body: { sha: "new-tree-sha" } };
  }
  if (call.method === "POST" && call.url.endsWith("/git/commits")) {
    return {
      status: 201,
      body: {
        sha: "new-commit-sha",
        message: "commit message",
        author: { name: "Claude", date: "2026-08-09T00:00:00Z" },
      },
    };
  }
  if (call.method === "PATCH" && call.url.includes("/git/refs/heads/")) {
    return { status: 200, body: {} };
  }
  throw new Error(`Unexpected request: ${call.method} ${call.url}`);
}

describe("github_file_ops server", () => {
  let repoDir = "";
  let context: Parameters<typeof commitFiles>[1];

  beforeEach(() => {
    repoDir = mkdtempSync(join("/tmp", "file-ops-"));
    calls = [];
    respond = happyPath;
    context = {
      owner: "test-owner",
      repo: "test-repo",
      branch: "claude/branch",
      repoDir,
      githubToken: "test-token",
      baseBranch: "main",
    };
  });

  afterEach(() => {
    if (repoDir) rmSync(repoDir, { recursive: true, force: true });
  });

  function writeRepoFile(path: string, contents: string | Buffer): string {
    const fullPath = join(repoDir, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents);
    return fullPath;
  }

  const parse = (result: { content: { text: string }[] }) =>
    JSON.parse(result.content[0]!.text);

  describe("commit_files", () => {
    test("walks the git data API in order and returns the new commit", async () => {
      writeRepoFile("src/main.ts", "export const x = 1;\n");

      const result = await commitFiles(
        { files: ["src/main.ts"], message: "add main" },
        context,
        FAST_RETRY,
      );

      expect(
        calls.map((call) => `${call.method} ${new URL(call.url).pathname}`),
      ).toEqual([
        "GET /repos/test-owner/test-repo/git/refs/heads/claude/branch",
        "GET /repos/test-owner/test-repo/git/commits/base-sha",
        "POST /repos/test-owner/test-repo/git/trees",
        "POST /repos/test-owner/test-repo/git/commits",
        "PATCH /repos/test-owner/test-repo/git/refs/heads/claude/branch",
      ]);

      expect(parse(result)).toEqual({
        commit: {
          sha: "new-commit-sha",
          message: "commit message",
          author: "Claude",
          date: "2026-08-09T00:00:00Z",
        },
        files: [{ path: "src/main.ts" }],
        tree: { sha: "new-tree-sha" },
      });
    });

    test("sends text file contents inline, based on the base tree", async () => {
      writeRepoFile("README.md", "# hello\n");

      await commitFiles(
        { files: ["README.md"], message: "docs" },
        context,
        FAST_RETRY,
      );

      const tree = calls.find((call) => call.url.endsWith("/git/trees"))!;
      expect(tree.body.base_tree).toBe("base-tree-sha");
      expect(tree.body.tree).toEqual([
        {
          path: "README.md",
          mode: "100644",
          type: "blob",
          content: "# hello\n",
        },
      ]);
    });

    test("preserves the executable bit as mode 100755", async () => {
      const fullPath = writeRepoFile("scripts/deploy.sh", "#!/bin/sh\n");
      chmodSync(fullPath, 0o755);

      await commitFiles(
        { files: ["scripts/deploy.sh"], message: "add script" },
        context,
        FAST_RETRY,
      );

      const tree = calls.find((call) => call.url.endsWith("/git/trees"))!;
      expect(tree.body.tree[0].mode).toBe("100755");
    });

    test("uploads binary files as base64 blobs and references them by sha", async () => {
      // A tree entry with inline `content` would corrupt a PNG — it has to go
      // through the blobs API with encoding: base64.
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
      writeRepoFile("assets/logo.png", bytes);

      await commitFiles(
        { files: ["assets/logo.png"], message: "add logo" },
        context,
        FAST_RETRY,
      );

      const blob = calls.find((call) => call.url.endsWith("/git/blobs"))!;
      expect(blob.body).toEqual({
        content: bytes.toString("base64"),
        encoding: "base64",
      });

      const tree = calls.find((call) => call.url.endsWith("/git/trees"))!;
      expect(tree.body.tree).toEqual([
        {
          path: "assets/logo.png",
          mode: "100644",
          type: "blob",
          sha: "blob-sha",
        },
      ]);
      expect(tree.body.tree[0].content).toBeUndefined();
    });

    test("refuses a path that escapes the repository root", async () => {
      writeRepoFile("inside.txt", "ok\n");

      await expect(
        commitFiles(
          { files: ["../outside.txt"], message: "escape" },
          context,
          FAST_RETRY,
        ),
      ).rejects.toThrow();

      // Nothing reached GitHub.
      expect(calls).toEqual([]);
    });

    test("authenticates every request as the configured token", async () => {
      writeRepoFile("a.txt", "a\n");

      await commitFiles(
        { files: ["a.txt"], message: "a" },
        context,
        FAST_RETRY,
      );

      for (const call of calls) {
        expect(call.headers.Authorization).toBe("Bearer test-token");
        expect(call.headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
      }
    });
  });

  describe("delete_files", () => {
    test("creates tree entries with a null sha and reports the deletions", async () => {
      writeRepoFile("src/old.ts", "old\n");
      writeRepoFile("docs/gone.md", "gone\n");

      const result = await deleteFiles(
        { paths: ["src/old.ts", "docs/gone.md"], message: "cleanup" },
        context,
        FAST_RETRY,
      );

      const tree = calls.find((call) => call.url.endsWith("/git/trees"))!;
      expect(tree.body.tree).toEqual([
        { path: "src/old.ts", mode: "100644", type: "blob", sha: null },
        { path: "docs/gone.md", mode: "100644", type: "blob", sha: null },
      ]);

      expect(parse(result).deletedFiles).toEqual([
        { path: "src/old.ts" },
        { path: "docs/gone.md" },
      ]);
    });

    test("rejects an absolute path outside the working directory", async () => {
      await expect(
        deleteFiles(
          { paths: ["/etc/passwd"], message: "nope" },
          context,
          FAST_RETRY,
        ),
      ).rejects.toThrow(/must be relative to repository root/);

      expect(calls).toEqual([]);
    });

    test("refuses a relative path that escapes the repository root", async () => {
      await expect(
        deleteFiles(
          { paths: ["../../secrets.txt"], message: "nope" },
          context,
          FAST_RETRY,
        ),
      ).rejects.toThrow();

      expect(calls).toEqual([]);
    });

    test("requires the path's parent directory to exist locally", async () => {
      // validatePathWithinRepo realpaths the parent directory, so a deletion
      // is rejected when the containing directory is not on disk — even though
      // the file only needs to exist on the remote. Pinned as behaviour, not
      // endorsed: it makes "delete a file the working tree no longer has"
      // fail with a path-validation error rather than a useful one.
      await expect(
        deleteFiles(
          { paths: ["never/created/file.ts"], message: "cleanup" },
          context,
          FAST_RETRY,
        ),
      ).rejects.toThrow(/resolves outside the repository root/);

      expect(calls).toEqual([]);
    });

    test("does not treat a sibling directory sharing cwd as a string prefix as being inside cwd", async () => {
      // Regression: the CWD strip used `startsWith(cwd)` with no path-separator
      // boundary, so an absolute path in a sibling directory whose name happens
      // to start with cwd's name (e.g. cwd "/a/repo" and this path
      // "/a/repo-evil/secrets.txt") was misidentified as being inside cwd and
      // had one character over-stripped, instead of hitting the intended
      // "must be relative to repository root" rejection.
      const siblingPath = `${process.cwd()}-evil/secrets.txt`;

      await expect(
        deleteFiles(
          { paths: [siblingPath], message: "nope" },
          context,
          FAST_RETRY,
        ),
      ).rejects.toThrow(/must be relative to repository root/);

      expect(calls).toEqual([]);
    });

    test("deletes a path whose parent exists but whose file is already gone", async () => {
      mkdirSync(join(repoDir, "src"), { recursive: true });

      const result = await deleteFiles(
        { paths: ["src/already-removed.ts"], message: "cleanup" },
        context,
        FAST_RETRY,
      );

      expect(parse(result).deletedFiles).toEqual([
        { path: "src/already-removed.ts" },
      ]);
    });
  });

  describe("branch creation", () => {
    test("creates the branch from the base branch when it does not exist", async () => {
      respond = (call) => {
        if (
          call.method === "GET" &&
          call.url.includes("/git/refs/heads/claude/branch")
        ) {
          return { status: 404 };
        }
        if (
          call.method === "GET" &&
          call.url.includes("/git/refs/heads/main")
        ) {
          return { status: 200, body: { object: { sha: "main-sha" } } };
        }
        if (call.method === "POST" && call.url.endsWith("/git/refs")) {
          return { status: 201, body: {} };
        }
        return happyPath(call);
      };

      const sha = await getOrCreateBranchRef(
        "test-owner",
        "test-repo",
        "claude/branch",
        "test-token",
        "main",
      );

      expect(sha).toBe("main-sha");
      const create = calls.find((call) => call.url.endsWith("/git/refs"))!;
      expect(create.body).toEqual({
        ref: "refs/heads/claude/branch",
        sha: "main-sha",
      });
    });

    test("falls back to the repository default branch when the base is gone", async () => {
      respond = (call) => {
        if (call.method === "GET" && call.url.includes("/git/refs/heads/")) {
          if (call.url.includes("/heads/trunk")) {
            return { status: 200, body: { object: { sha: "trunk-sha" } } };
          }
          return { status: 404 };
        }
        if (call.url.endsWith("/repos/test-owner/test-repo")) {
          return { status: 200, body: { default_branch: "trunk" } };
        }
        if (call.method === "POST" && call.url.endsWith("/git/refs")) {
          return { status: 201, body: {} };
        }
        return happyPath(call);
      };

      const sha = await getOrCreateBranchRef(
        "test-owner",
        "test-repo",
        "claude/branch",
        "test-token",
        "deleted-base",
      );

      expect(sha).toBe("trunk-sha");
    });

    test("surfaces a non-404 lookup failure instead of creating a branch", async () => {
      respond = () => ({ status: 500 });

      await expect(
        getOrCreateBranchRef(
          "test-owner",
          "test-repo",
          "claude/branch",
          "test-token",
          "main",
        ),
      ).rejects.toThrow("Failed to get branch reference: 500");
    });
  });

  describe("ref update retries", () => {
    test("retries a 403 and explains the rebase workaround when it persists", async () => {
      respond = (call) => {
        if (call.method === "PATCH") {
          return {
            status: 403,
            text: "Resource not accessible by integration",
          };
        }
        return happyPath(call);
      };
      writeRepoFile("a.txt", "a\n");

      await expect(
        commitFiles({ files: ["a.txt"], message: "a" }, context, FAST_RETRY),
      ).rejects.toThrow(/Permission denied: Unable to push commits/);

      expect(calls.filter((call) => call.method === "PATCH").length).toBe(3);
    });

    test("retries non-403 failures too, despite the wording it once carried", async () => {
      // Pinning actual behaviour: no shouldRetry predicate is passed to
      // retryWithBackoff, so a permanent error still costs all three attempts.
      // Narrowing that is a behaviour change, deliberately not made here.
      respond = (call) => {
        if (call.method === "PATCH") {
          return { status: 422, text: "Reference cannot be updated" };
        }
        return happyPath(call);
      };
      writeRepoFile("a.txt", "a\n");

      await expect(
        commitFiles({ files: ["a.txt"], message: "a" }, context, FAST_RETRY),
      ).rejects.toThrow(/Failed to update reference: 422/);

      expect(calls.filter((call) => call.method === "PATCH").length).toBe(3);
    });

    test("succeeds when a retried 403 clears", async () => {
      let attempts = 0;
      respond = (call) => {
        if (call.method === "PATCH") {
          attempts++;
          return attempts === 1
            ? { status: 403, text: "transient" }
            : { status: 200, body: {} };
        }
        return happyPath(call);
      };
      writeRepoFile("a.txt", "a\n");

      const result = await commitFiles(
        { files: ["a.txt"], message: "a" },
        context,
        FAST_RETRY,
      );

      expect(parse(result).commit.sha).toBe("new-commit-sha");
      expect(attempts).toBe(2);
    });
  });

  describe("getFileMode", () => {
    test("reports regular, executable and directory modes", async () => {
      const regular = writeRepoFile("plain.txt", "x\n");
      const script = writeRepoFile("run.sh", "#!/bin/sh\n");
      chmodSync(script, 0o755);

      expect(await getFileMode(regular)).toBe("100644");
      expect(await getFileMode(script)).toBe("100755");
      expect(await getFileMode(repoDir)).toBe("040000");
    });

    test("defaults to a regular file when the path cannot be stat'd", async () => {
      expect(await getFileMode(join(repoDir, "missing.txt"))).toBe("100644");
    });
  });

  describe("readFileOpsContext", () => {
    test("reads the full context from the environment", () => {
      expect(
        readFileOpsContext({
          REPO_OWNER: "o",
          REPO_NAME: "r",
          BRANCH_NAME: "b",
          GITHUB_TOKEN: "t",
          REPO_DIR: "/repo",
          BASE_BRANCH: "main",
        } as NodeJS.ProcessEnv),
      ).toEqual({
        owner: "o",
        repo: "r",
        branch: "b",
        githubToken: "t",
        repoDir: "/repo",
        baseBranch: "main",
      });
    });

    test("defaults repoDir to the working directory", () => {
      const context = readFileOpsContext({
        REPO_OWNER: "o",
        REPO_NAME: "r",
        BRANCH_NAME: "b",
        GITHUB_TOKEN: "t",
      } as NodeJS.ProcessEnv);

      expect(context.repoDir).toBe(process.cwd());
      expect(context.baseBranch).toBeUndefined();
    });

    test("rejects a missing repository environment", () => {
      expect(() =>
        readFileOpsContext({ REPO_OWNER: "o" } as NodeJS.ProcessEnv),
      ).toThrow(MISSING_REPO_ENV_MESSAGE);
    });

    test("rejects a missing token", () => {
      expect(() =>
        readFileOpsContext({
          REPO_OWNER: "o",
          REPO_NAME: "r",
          BRANCH_NAME: "b",
        } as NodeJS.ProcessEnv),
      ).toThrow("GITHUB_TOKEN environment variable is required");
    });
  });
});
