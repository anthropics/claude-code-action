#!/usr/bin/env bun

/**
 * Tests for computeChangedFileSHAs, which hashes a PR's changed files in a
 * single batched `git hash-object --stdin-paths` call.
 *
 * These run against real git in a scratch repository rather than a mocked
 * child_process. The behaviour under test *is* git's batch semantics — order
 * preservation, and aborting the whole batch on the first unreadable path —
 * so asserting against a mock would only re-state the assumptions the
 * implementation already makes.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeChangedFileSHAs } from "../src/github/data/fetcher";
import type { GitHubFile } from "../src/github/types";

function file(path: string, changeType = "MODIFIED"): GitHubFile {
  return { path, additions: 1, deletions: 0, changeType };
}

/** The SHA git reports for a path, computed independently of the batch path. */
function expectedSHA(path: string): string {
  return execFileSync("git", ["hash-object", "--", path], {
    encoding: "utf-8",
  }).trim();
}

let repoDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  repoDir = mkdtempSync(join(tmpdir(), "hash-object-test-"));
  execFileSync("git", ["init", "-q", repoDir]);
  process.chdir(repoDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(repoDir, { recursive: true, force: true });
});

function write(path: string, contents: string) {
  const full = join(repoDir, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, contents);
}

describe("computeChangedFileSHAs", () => {
  test("returns an empty list for no changed files", () => {
    expect(computeChangedFileSHAs([])).toEqual([]);
  });

  test("hashes a single file", () => {
    write("a.txt", "aaa\n");
    const [result] = computeChangedFileSHAs([file("a.txt")]);
    expect(result!.sha).toBe(expectedSHA("a.txt"));
  });

  test("preserves per-file ordering across the batch", () => {
    write("a.txt", "aaa\n");
    write("b.txt", "bbb\n");
    write("c.txt", "ccc\n");

    // Deliberately not in sorted order — a batch that returned SHAs in git's
    // own order rather than input order would pass a sorted list by accident.
    const results = computeChangedFileSHAs([
      file("c.txt"),
      file("a.txt"),
      file("b.txt"),
    ]);

    expect(results.map((r) => r.path)).toEqual(["c.txt", "a.txt", "b.txt"]);
    expect(results[0]!.sha).toBe(expectedSHA("c.txt"));
    expect(results[1]!.sha).toBe(expectedSHA("a.txt"));
    expect(results[2]!.sha).toBe(expectedSHA("b.txt"));
  });

  test("identical contents hash to the same SHA", () => {
    write("a.txt", "same\n");
    write("b.txt", "same\n");
    const results = computeChangedFileSHAs([file("a.txt"), file("b.txt")]);
    expect(results[0]!.sha).toBe(results[1]!.sha);
  });

  test("preserves the file's other fields", () => {
    write("a.txt", "aaa\n");
    const [result] = computeChangedFileSHAs([
      { path: "a.txt", additions: 10, deletions: 3, changeType: "MODIFIED" },
    ]);
    expect(result).toEqual({
      path: "a.txt",
      additions: 10,
      deletions: 3,
      changeType: "MODIFIED",
      sha: expectedSHA("a.txt"),
    });
  });

  describe("deleted files", () => {
    test("are reported as deleted without being hashed", () => {
      // No file is written, so hashing would fail if it were attempted.
      const [result] = computeChangedFileSHAs([file("gone.txt", "DELETED")]);
      expect(result!.sha).toBe("deleted");
    });

    test("do not disturb the SHAs of surrounding files", () => {
      // Regression guard for zipping batch output onto the full list rather
      // than the hashable subset: a deleted file in the middle would shift
      // every subsequent SHA by one.
      write("a.txt", "aaa\n");
      write("b.txt", "bbb\n");

      const results = computeChangedFileSHAs([
        file("a.txt"),
        file("gone.txt", "DELETED"),
        file("b.txt"),
      ]);

      expect(results[0]!.sha).toBe(expectedSHA("a.txt"));
      expect(results[1]!.sha).toBe("deleted");
      expect(results[2]!.sha).toBe(expectedSHA("b.txt"));
    });

    test("an all-deleted set needs no hashing at all", () => {
      const results = computeChangedFileSHAs([
        file("x.txt", "DELETED"),
        file("y.txt", "DELETED"),
      ]);
      expect(results.map((r) => r.sha)).toEqual(["deleted", "deleted"]);
    });
  });

  describe("failure isolation", () => {
    test("one missing file does not degrade the others", () => {
      // git aborts the whole batch on the first unreadable path, so without a
      // per-file fallback every SHA here would come back "unknown".
      write("a.txt", "aaa\n");
      write("b.txt", "bbb\n");

      const results = computeChangedFileSHAs([
        file("a.txt"),
        file("missing.txt"),
        file("b.txt"),
      ]);

      expect(results[0]!.sha).toBe(expectedSHA("a.txt"));
      expect(results[1]!.sha).toBe("unknown");
      expect(results[2]!.sha).toBe(expectedSHA("b.txt"));
    });

    test("every file missing yields unknown for each", () => {
      const results = computeChangedFileSHAs([
        file("nope1.txt"),
        file("nope2.txt"),
      ]);
      expect(results.map((r) => r.sha)).toEqual(["unknown", "unknown"]);
    });

    test("a directory path is reported unknown, not fatal", () => {
      mkdirSync(join(repoDir, "adir"), { recursive: true });
      write("a.txt", "aaa\n");

      const results = computeChangedFileSHAs([file("adir"), file("a.txt")]);
      expect(results[0]!.sha).toBe("unknown");
      expect(results[1]!.sha).toBe(expectedSHA("a.txt"));
    });
  });

  describe("awkward paths", () => {
    test("a path beginning with a dash is hashed, not parsed as an option", () => {
      write("-dash.txt", "dash\n");
      const [result] = computeChangedFileSHAs([file("-dash.txt")]);
      expect(result!.sha).toBe(expectedSHA("-dash.txt"));
    });

    test("a leading-dash path still works on the per-file fallback", () => {
      // The missing file forces the fallback, which passes paths as arguments.
      write("-dash.txt", "dash\n");
      const results = computeChangedFileSHAs([
        file("-dash.txt"),
        file("missing.txt"),
      ]);
      expect(results[0]!.sha).toBe(expectedSHA("-dash.txt"));
      expect(results[1]!.sha).toBe("unknown");
    });

    test("paths with spaces are hashed correctly", () => {
      write("sp ace.txt", "space\n");
      const [result] = computeChangedFileSHAs([file("sp ace.txt")]);
      expect(result!.sha).toBe(expectedSHA("sp ace.txt"));
    });

    test("nested paths are hashed correctly", () => {
      write("src/nested/deep.txt", "deep\n");
      const [result] = computeChangedFileSHAs([file("src/nested/deep.txt")]);
      expect(result!.sha).toBe(expectedSHA("src/nested/deep.txt"));
    });

    test("a path containing a newline is hashed correctly", () => {
      // --stdin-paths is newline-delimited, so such a path is read as two.
      // Both halves are missing here, so the batch aborts and the fallback
      // hashes the real file.
      const weird = "new\nline.txt";
      write(weird, "weird\n");

      const [result] = computeChangedFileSHAs([file(weird)]);
      expect(result!.sha).toBe(expectedSHA(weird));
    });

    test("a newline path whose halves both exist is not silently mis-hashed", () => {
      // The dangerous case: git splits "a\nb.txt" into "a" and "b.txt", finds
      // both, exits 0, and returns two SHAs for one requested path — neither
      // belonging to the real file. Only the one-SHA-per-path count check
      // catches this; without it the file silently gets the SHA of "a".
      write("a", "AAA\n");
      write("b.txt", "BBB\n");
      const weird = "a\nb.txt";
      write(weird, "WEIRD\n");

      const [result] = computeChangedFileSHAs([file(weird)]);

      expect(result!.sha).toBe(expectedSHA(weird));
      expect(result!.sha).not.toBe(expectedSHA("a"));
      expect(result!.sha).not.toBe(expectedSHA("b.txt"));
    });
  });

  test("handles a large batch in one pass", () => {
    const files: GitHubFile[] = [];
    for (let i = 0; i < 200; i++) {
      write(`f${i}.txt`, `contents ${i}\n`);
      files.push(file(`f${i}.txt`));
    }

    const results = computeChangedFileSHAs(files);
    expect(results).toHaveLength(200);
    expect(results.every((r) => /^[0-9a-f]{40}$/.test(r.sha))).toBe(true);
    expect(results[0]!.sha).toBe(expectedSHA("f0.txt"));
    expect(results[199]!.sha).toBe(expectedSHA("f199.txt"));
    // Distinct contents must produce distinct SHAs — a batch that repeated one
    // line, or zipped incorrectly, would collapse them.
    expect(new Set(results.map((r) => r.sha)).size).toBe(200);
  });
});
