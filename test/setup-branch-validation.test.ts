import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { setupBranch } from "../src/github/operations/branch";
import { createMockContext } from "./mockContext";

const octokits = {
  rest: {
    repos: { get: async () => ({ data: { default_branch: "main" } }) },
    git: { getRef: async () => ({ data: { object: { sha: "abc1234" } } }) },
  },
} as any;

const githubData = {
  contextData: { title: "Add feature", labels: { nodes: [] } },
} as any;

// ':' is rejected by validateBranchName. The signing path used to skip that
// check and only fail on the file ops server's first commit (a 422).
const INVALID_TEMPLATE = "{{prefix}}release:{{entityNumber}}";

const loggedErrors: string[] = [];

describe("setupBranch generated branch name validation", () => {
  let originalCwd: string;
  let tempDir: string;
  let originalError: typeof console.error;

  beforeEach(() => {
    originalCwd = process.cwd();
    // Not a git repo, so the remote existence probe fails and setupBranch
    // continues with the generated name.
    tempDir = mkdtempSync(join(tmpdir(), "setup-branch-"));
    process.chdir(tempDir);

    loggedErrors.length = 0;
    originalError = console.error;
    console.error = (...args: unknown[]) => {
      loggedErrors.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    console.error = originalError;
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  for (const useCommitSigning of [true, false]) {
    test(`rejects an invalid generated branch name with use_commit_signing: ${useCommitSigning}`, async () => {
      const context = createMockContext({
        isPR: false,
        entityNumber: 42,
        inputs: {
          useCommitSigning,
          branchPrefix: "claude/",
          branchNameTemplate: INVALID_TEMPLATE,
        },
      });

      await expect(setupBranch(octokits, githubData, context)).rejects.toThrow(
        'Invalid branch name: "claude/release:42"',
      );
      // Must fail on the name itself, not on a later git or API call.
      expect(loggedErrors.join("\n")).toContain(
        'Invalid branch name: "claude/release:42"',
      );
    });
  }
});
