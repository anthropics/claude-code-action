import { execFileSync } from "child_process";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
} from "fs";
import { dirname, join, posix } from "path";

// Paths that are both PR-controllable and read from cwd at CLI startup.
//
// Deliberately excluded from the CLI's broader auto-edit blocklist:
//   .git/        — not tracked by git; PR commits cannot place files there.
//                  Restoring it would also undo the PR checkout entirely.
//   .gitconfig   — git reads ~/.gitconfig and .git/config, never cwd/.gitconfig.
//   .bashrc etc. — shells source these from $HOME; checkout cannot reach $HOME.
//   .vscode/.idea— IDE config; nothing in the CLI's startup path reads them.
const SENSITIVE_PATHS = [
  ".claude",
  ".mcp.json",
  ".claude.json",
  ".gitmodules",
  ".ripgreprc",
  "CLAUDE.md",
  "CLAUDE.local.md",
  ".husky",
];

const CLAUDE_PR_EXCLUDE_PATTERN = "/.claude-pr/";

const GITLINK_MODE = "160000";
const SYMLINK_MODE = "120000";
const PR_SNAPSHOT_SUFFIX = ".pr-snapshot";

interface GitIndexEntry {
  mode: string;
  path: string;
}

interface GitTreeEntry {
  mode: string;
  type: string;
  objectId: string;
  path: string;
}

function lstatIfPresent(path: string) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

function isInstructionBasename(name: string): boolean {
  return name === "CLAUDE.md" || name === "CLAUDE.local.md";
}

function isClaudePrPath(path: string): boolean {
  return path === ".claude-pr" || path.startsWith(".claude-pr/");
}

function assertSafeGitPath(path: string): void {
  const components = path.split("/");
  if (
    path.length === 0 ||
    path.includes("\0") ||
    posix.isAbsolute(path) ||
    components.some(
      (component) =>
        component.length === 0 || component === "." || component === "..",
    )
  ) {
    throw new Error(`Refusing unsafe repository path: ${JSON.stringify(path)}`);
  }
}

function worktreePath(repoRoot: string, path: string): string {
  assertSafeGitPath(path);
  return join(repoRoot, ...path.split("/"));
}

function gitOutput(args: string[], cwd?: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseTreeEntries(output: string): GitTreeEntry[] {
  return output
    .split("\0")
    .filter((record) => record.length > 0)
    .map((record) => {
      const separator = record.indexOf("\t");
      if (separator === -1) {
        throw new Error("Git returned an invalid ls-tree record");
      }

      const [mode, type, objectId] = record.slice(0, separator).split(" ");
      const path = record.slice(separator + 1);
      if (!mode || !type || !objectId || !path) {
        throw new Error("Git returned an incomplete ls-tree record");
      }
      assertSafeGitPath(path);
      return { mode, type, objectId, path };
    });
}

function listBaseTreeEntries(
  repoRoot: string,
  baseRef: string,
): GitTreeEntry[] {
  return parseTreeEntries(
    gitOutput(
      ["--literal-pathspecs", "ls-tree", "-r", "-z", "--full-tree", baseRef],
      repoRoot,
    ),
  );
}

function getBaseTreeEntry(
  repoRoot: string,
  baseRef: string,
  path: string,
  cache: Map<string, GitTreeEntry | null>,
): GitTreeEntry | null {
  assertSafeGitPath(path);
  const cached = cache.get(path);
  if (cached !== undefined) {
    return cached;
  }

  const entries = parseTreeEntries(
    gitOutput(
      ["--literal-pathspecs", "ls-tree", "-z", baseRef, "--", path],
      repoRoot,
    ),
  );
  if (entries.length === 0) {
    cache.set(path, null);
    return null;
  }
  const [entry] = entries;
  if (entries.length !== 1 || entry === undefined || entry.path !== path) {
    throw new Error(
      `Git returned an ambiguous base-tree result for ${JSON.stringify(path)}`,
    );
  }

  cache.set(path, entry);
  return entry;
}

function listHeadIndexEntries(repoRoot: string): GitIndexEntry[] {
  return gitOutput(
    ["--literal-pathspecs", "ls-files", "--stage", "-z"],
    repoRoot,
  )
    .split("\0")
    .filter((record) => record.length > 0)
    .map((record) => {
      const separator = record.indexOf("\t");
      if (separator === -1) {
        throw new Error("Git returned an invalid index record");
      }

      const [mode] = record.slice(0, separator).split(" ");
      const path = record.slice(separator + 1);
      if (!mode || !path) {
        throw new Error("Git returned an incomplete index record");
      }
      assertSafeGitPath(path);
      return { mode, path };
    });
}

function scanGitlinkDirectory(
  absolutePath: string,
  gitlinkPath: string,
  relativePath = "",
): void {
  for (const name of readdirSync(absolutePath)) {
    const childRelativePath =
      relativePath.length === 0 ? name : posix.join(relativePath, name);
    if (isInstructionBasename(name)) {
      throw new Error(
        `Refusing to continue: populated gitlink ${JSON.stringify(
          gitlinkPath,
        )} contains instruction file ${JSON.stringify(childRelativePath)}`,
      );
    }

    const childPath = join(absolutePath, name);
    const stat = lstatSync(childPath);
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      scanGitlinkDirectory(childPath, gitlinkPath, childRelativePath);
    }
  }
}

function assertPopulatedGitlinksContainNoInstructions(
  repoRoot: string,
  headGitlinks: ReadonlySet<string>,
): void {
  for (const gitlinkPath of headGitlinks) {
    let absolutePath = repoRoot;
    const components = gitlinkPath.split("/");
    let populated = true;

    for (let index = 0; index < components.length; index += 1) {
      const component = components[index];
      if (component === undefined) {
        throw new Error(`Invalid gitlink path ${JSON.stringify(gitlinkPath)}`);
      }
      absolutePath = join(absolutePath, component);
      const stat = lstatIfPresent(absolutePath);
      if (stat === undefined) {
        populated = false;
        break;
      }

      const isFinal = index === components.length - 1;
      if (!isFinal && (stat.isSymbolicLink() || !stat.isDirectory())) {
        throw new Error(
          `Refusing to inspect populated gitlink ${JSON.stringify(
            gitlinkPath,
          )}: an ancestor is not a real directory`,
        );
      }
      if (isFinal && (stat.isSymbolicLink() || !stat.isDirectory())) {
        throw new Error(
          `Refusing to inspect populated gitlink ${JSON.stringify(
            gitlinkPath,
          )}: its worktree is not a real directory`,
        );
      }
    }

    if (!populated) {
      continue;
    }
    if (isInstructionBasename(posix.basename(gitlinkPath))) {
      throw new Error(
        `Refusing to continue: populated gitlink ${JSON.stringify(
          gitlinkPath,
        )} has an instruction basename`,
      );
    }
    scanGitlinkDirectory(absolutePath, gitlinkPath);
  }
}

function readBaseSymlinkTarget(repoRoot: string, objectId: string): string {
  return execFileSync("git", ["cat-file", "blob", objectId], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  }).toString("utf8");
}

function resolveBaseSymlinkTarget(linkPath: string, target: string): string {
  if (
    target.length === 0 ||
    target.includes("\0") ||
    posix.isAbsolute(target)
  ) {
    throw new Error(
      `Trusted base instruction link ${JSON.stringify(
        linkPath,
      )} has an unsafe target ${JSON.stringify(target)}`,
    );
  }

  const targetPath = posix.normalize(
    posix.join(posix.dirname(linkPath), target),
  );
  try {
    assertSafeGitPath(targetPath);
  } catch {
    throw new Error(
      `Trusted base instruction link ${JSON.stringify(
        linkPath,
      )} escapes the repository`,
    );
  }
  if (isClaudePrPath(targetPath)) {
    throw new Error(
      `Trusted base instruction link ${JSON.stringify(
        linkPath,
      )} targets reserved snapshot path ${JSON.stringify(targetPath)}`,
    );
  }
  return targetPath;
}

function buildTrustedInstructionTargetClosure(
  repoRoot: string,
  baseRef: string,
  instructionPaths: ReadonlySet<string>,
  baseEntryCache: Map<string, GitTreeEntry | null>,
): Set<string> {
  const closure = new Set<string>();
  const resolved = new Set<string>();
  const visiting = new Set<string>();

  const visit = (path: string): void => {
    if (resolved.has(path)) {
      return;
    }
    if (visiting.has(path)) {
      throw new Error(
        `Trusted base instruction symlink cycle includes ${JSON.stringify(
          path,
        )}`,
      );
    }

    const entry = getBaseTreeEntry(repoRoot, baseRef, path, baseEntryCache);
    if (entry === null) {
      throw new Error(
        `Trusted base instruction target ${JSON.stringify(path)} is not tracked`,
      );
    }
    if (entry.type !== "blob") {
      throw new Error(
        `Trusted base instruction target ${JSON.stringify(path)} is not a blob`,
      );
    }
    if (entry.mode !== SYMLINK_MODE) {
      resolved.add(path);
      return;
    }

    visiting.add(path);
    const target = readBaseSymlinkTarget(repoRoot, entry.objectId);
    const targetPath = resolveBaseSymlinkTarget(path, target);
    const targetEntry = getBaseTreeEntry(
      repoRoot,
      baseRef,
      targetPath,
      baseEntryCache,
    );
    if (targetEntry === null) {
      throw new Error(
        `Trusted base instruction link ${JSON.stringify(
          path,
        )} targets untracked path ${JSON.stringify(targetPath)}`,
      );
    }
    if (targetEntry.type !== "blob") {
      throw new Error(
        `Trusted base instruction link ${JSON.stringify(
          path,
        )} targets non-blob path ${JSON.stringify(targetPath)}`,
      );
    }

    closure.add(targetPath);
    visit(targetPath);
    visiting.delete(path);
    resolved.add(path);
  };

  for (const path of instructionPaths) {
    visit(path);
  }
  return closure;
}

function canReadWorktreePathWithoutFollowing(
  repoRoot: string,
  path: string,
  headGitlinks: ReadonlySet<string>,
): boolean {
  assertSafeGitPath(path);
  let absolutePath = repoRoot;
  let prefix = "";
  const components = path.split("/");

  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    if (component === undefined) {
      throw new Error(`Invalid worktree path ${JSON.stringify(path)}`);
    }
    prefix = prefix.length === 0 ? component : posix.join(prefix, component);
    absolutePath = join(absolutePath, component);
    const stat = lstatIfPresent(absolutePath);
    if (stat === undefined || headGitlinks.has(prefix)) {
      return false;
    }

    const isFinal = index === components.length - 1;
    if (!isFinal && (stat.isSymbolicLink() || !stat.isDirectory())) {
      return false;
    }
  }
  return true;
}

function snapshotEntryWithoutFollowing(
  repoRoot: string,
  sourcePath: string,
  destinationParent: string,
  headGitlinks: ReadonlySet<string>,
): boolean {
  if (headGitlinks.has(sourcePath)) {
    return false;
  }

  const sourceAbsolutePath = worktreePath(repoRoot, sourcePath);
  const stat = lstatIfPresent(sourceAbsolutePath);
  if (stat === undefined || stat.isSymbolicLink()) {
    return false;
  }

  const sourceBasename = posix.basename(sourcePath);
  const destinationBasename = isInstructionBasename(sourceBasename)
    ? `${sourceBasename}${PR_SNAPSHOT_SUFFIX}`
    : sourceBasename;
  const destinationPath = posix.join(destinationParent, destinationBasename);
  const destinationAbsolutePath = worktreePath(repoRoot, destinationPath);

  if (stat.isDirectory()) {
    mkdirSync(destinationAbsolutePath, { recursive: true });
    for (const name of readdirSync(sourceAbsolutePath)) {
      snapshotEntryWithoutFollowing(
        repoRoot,
        posix.join(sourcePath, name),
        destinationPath,
        headGitlinks,
      );
    }
    return true;
  }
  if (!stat.isFile()) {
    return false;
  }

  mkdirSync(dirname(destinationAbsolutePath), { recursive: true });
  copyFileSync(sourceAbsolutePath, destinationAbsolutePath);
  return true;
}

function snapshotSensitivePath(
  repoRoot: string,
  sourcePath: string,
  headGitlinks: ReadonlySet<string>,
): boolean {
  if (
    !canReadWorktreePathWithoutFollowing(repoRoot, sourcePath, headGitlinks)
  ) {
    return false;
  }

  const sourceParent = posix.dirname(sourcePath);
  const destinationParent =
    sourceParent === "."
      ? ".claude-pr"
      : posix.join(".claude-pr", sourceParent);
  return snapshotEntryWithoutFollowing(
    repoRoot,
    sourcePath,
    destinationParent,
    headGitlinks,
  );
}

function removeEntryWithoutFollowing(absolutePath: string): void {
  const stat = lstatIfPresent(absolutePath);
  if (stat === undefined) {
    return;
  }

  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    for (const name of readdirSync(absolutePath)) {
      removeEntryWithoutFollowing(join(absolutePath, name));
    }
    rmdirSync(absolutePath);
    return;
  }
  unlinkSync(absolutePath);
}

function prepareWorktreePathForRemoval(
  repoRoot: string,
  path: string,
  headGitlinks: ReadonlySet<string>,
): string | undefined {
  assertSafeGitPath(path);
  let absolutePath = repoRoot;
  let prefix = "";
  const components = path.split("/");

  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    if (component === undefined) {
      throw new Error(`Invalid worktree path ${JSON.stringify(path)}`);
    }
    prefix = prefix.length === 0 ? component : posix.join(prefix, component);
    absolutePath = join(absolutePath, component);
    const stat = lstatIfPresent(absolutePath);
    if (stat === undefined) {
      return undefined;
    }

    const isFinal = index === components.length - 1;
    if (
      !isFinal &&
      (headGitlinks.has(prefix) || stat.isSymbolicLink() || !stat.isDirectory())
    ) {
      removeEntryWithoutFollowing(absolutePath);
      return prefix;
    }
    if (isFinal) {
      removeEntryWithoutFollowing(absolutePath);
      return path;
    }
  }
  return undefined;
}

function indexContainsPath(
  entries: readonly GitIndexEntry[],
  path: string,
): boolean {
  return entries.some(
    (entry) => entry.path === path || entry.path.startsWith(`${path}/`),
  );
}

function sortGitPaths(paths: Iterable<string>): string[] {
  return [...new Set(paths)].sort((left, right) => {
    const depthDifference = left.split("/").length - right.split("/").length;
    if (depthDifference !== 0) {
      return depthDifference;
    }
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

function ensureClaudePrExcludedFromGit(): void {
  const excludePath = execFileSync(
    "git",
    ["rev-parse", "--git-path", "info/exclude"],
    { encoding: "utf8" },
  ).trim();

  const excludeContents = existsSync(excludePath)
    ? readFileSync(excludePath, "utf8")
    : "";

  if (excludeContents.split(/\r?\n/).includes(CLAUDE_PR_EXCLUDE_PATTERN)) {
    return;
  }

  mkdirSync(dirname(excludePath), { recursive: true });

  const prefix =
    excludeContents.length === 0 || excludeContents.endsWith("\n") ? "" : "\n";
  appendFileSync(excludePath, `${prefix}${CLAUDE_PR_EXCLUDE_PATTERN}\n`);
}

/**
 * Restores security-sensitive config paths from the PR base branch.
 *
 * The CLI's non-interactive mode trusts cwd: it reads `.mcp.json`,
 * `.claude/settings.json`, and `.claude/settings.local.json` from the working
 * directory and acts on them before any tool-permission gating — executing
 * hooks (including SessionStart), setting env vars (NODE_OPTIONS, LD_PRELOAD,
 * PATH), running apiKeyHelper/awsAuthRefresh shell commands, and auto-approving
 * MCP servers. When this action checks out a PR head, all of these are
 * attacker-controlled.
 *
 * Rather than enumerate every dangerous key, this replaces the entire `.claude/`
 * tree and `.mcp.json` with the versions from the PR base branch, which a
 * maintainer has reviewed and merged. Paths absent on base are deleted.
 *
 * Known limitation: if a PR legitimately modifies `.claude/` and the CLI later
 * commits with `git add -A`, the revert will be included in that commit. This
 * is a narrow UX tradeoff for closing the RCE surface.
 *
 * Only the paths listed in SENSITIVE_PATHS come from the base branch; the rest
 * of the working tree stays at the PR head. A base-branch hook or setting that
 * calls out through files a PR can change — package-manager scripts
 * (`bun run`, `npm run`, `yarn`, `pnpm run`), Makefile or task-runner targets,
 * repo-relative script paths, or tools that load executable project config —
 * therefore runs whatever the PR head provides. Keep restored hooks
 * self-contained: invoke the tool binary directly, pin its version, and pass
 * config on the command line rather than reading it from the checkout. This
 * extends to the runtime itself: `bunx <tool>` runs the tool under `node` when
 * `node` is on PATH, but on a Bun-only runner Bun executes the script and reads
 * `bunfig.toml` (e.g. `preload`) from the checkout, so `bunfig.toml` and
 * `.npmrc` there are PR-controlled runtime config too.
 *
 * @param baseBranch - PR base branch name. Must be pre-validated (branch.ts
 *   calls validateBranchName on it before returning).
 */
export function restoreConfigFromBase(baseBranch: string): void {
  console.log(
    `Restoring ${SENSITIVE_PATHS.join(", ")} from origin/${baseBranch} (PR head is untrusted)`,
  );

  const repoRoot = realpathSync(
    gitOutput(["rev-parse", "--show-toplevel"]).trim(),
  );
  const headIndexEntries = listHeadIndexEntries(repoRoot);
  const headGitlinks = new Set(
    headIndexEntries
      .filter((entry) => entry.mode === GITLINK_MODE)
      .map((entry) => entry.path),
  );

  // A superproject tree cannot describe files below a gitlink. Inspect only
  // populated gitlink worktrees, with lstat-based traversal and no nested Git
  // invocation, before changing anything Claude could read.
  assertPopulatedGitlinksContainNoInstructions(repoRoot, headGitlinks);

  // Fetch without consulting or populating submodules. The trusted base object
  // graph must be complete and validated before the first worktree mutation.
  execFileSync(
    "git",
    ["fetch", "origin", baseBranch, "--depth=1", "--no-recurse-submodules"],
    {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
    },
  );

  const baseRef = `origin/${baseBranch}`;
  const restoreNestedInstructions =
    process.env.DISABLE_NESTED_CLAUDE_MD_RESTORE !== "true";

  const headInstructionPaths = new Set(
    headIndexEntries
      .map((entry) => entry.path)
      .filter(
        (path) =>
          !isClaudePrPath(path) &&
          isInstructionBasename(posix.basename(path)) &&
          (restoreNestedInstructions || !path.includes("/")),
      ),
  );
  const baseInstructionPaths = new Set(
    listBaseTreeEntries(repoRoot, baseRef)
      .map((entry) => entry.path)
      .filter(
        (path) =>
          !isClaudePrPath(path) &&
          isInstructionBasename(posix.basename(path)) &&
          (restoreNestedInstructions || !path.includes("/")),
      ),
  );

  const affectedPaths = new Set<string>(SENSITIVE_PATHS);
  for (const path of headInstructionPaths) {
    affectedPaths.add(path);
  }
  for (const path of baseInstructionPaths) {
    affectedPaths.add(path);
  }

  const baseEntryCache = new Map<string, GitTreeEntry | null>();
  for (const path of affectedPaths) {
    getBaseTreeEntry(repoRoot, baseRef, path, baseEntryCache);
  }

  const trustedTargetClosure = buildTrustedInstructionTargetClosure(
    repoRoot,
    baseRef,
    baseInstructionPaths,
    baseEntryCache,
  );
  for (const path of trustedTargetClosure) {
    affectedPaths.add(path);
  }

  // Every lookup, including recursively derived symlink targets, is complete
  // before these arrays authorize any worktree deletion or checkout.
  const basePresentPaths: string[] = [];
  const baseAbsentPaths: string[] = [];
  for (const path of sortGitPaths(affectedPaths)) {
    const entry = getBaseTreeEntry(repoRoot, baseRef, path, baseEntryCache);
    if (entry === null) {
      baseAbsentPaths.push(path);
    } else {
      basePresentPaths.push(path);
    }
  }

  // Preserve regular PR-authored files for review. Instruction basenames are
  // suffixed at every depth, and symlinks are omitted rather than dereferenced.
  prepareWorktreePathForRemoval(repoRoot, ".claude-pr", headGitlinks);
  let preservedSnapshot = false;
  const snapshotPaths = sortGitPaths([
    ...SENSITIVE_PATHS,
    ...headInstructionPaths,
  ]);
  for (const path of snapshotPaths) {
    if (snapshotSensitivePath(repoRoot, path, headGitlinks)) {
      preservedSnapshot = true;
    }
  }
  if (preservedSnapshot) {
    console.log(
      "Preserved PR's sensitive paths -> .claude-pr/ for review agents (not executed)",
    );
    ensureClaudePrExcludedFromGit();
  }

  const resetPaths = new Set<string>();
  for (const path of [...baseAbsentPaths, ...basePresentPaths]) {
    const removedPath = prepareWorktreePathForRemoval(
      repoRoot,
      path,
      headGitlinks,
    );
    if (
      removedPath !== undefined &&
      indexContainsPath(headIndexEntries, removedPath)
    ) {
      resetPaths.add(removedPath);
    }
    if (indexContainsPath(headIndexEntries, path)) {
      resetPaths.add(path);
    }
  }

  // Only paths with an exact, prevalidated base-tree entry reach checkout.
  // Any checkout failure is fatal rather than being mistaken for base absence.
  if (basePresentPaths.length > 0) {
    execFileSync(
      "git",
      ["--literal-pathspecs", "checkout", baseRef, "--", ...basePresentPaths],
      {
        cwd: repoRoot,
        stdio: "pipe",
      },
    );
    for (const path of basePresentPaths) {
      resetPaths.add(path);
    }
  }

  // Checkout stages restores. Reset every restored or deleted path literally,
  // including any tracked obstruction removed above, without touching unrelated
  // worktree or index state.
  if (resetPaths.size > 0) {
    execFileSync(
      "git",
      ["--literal-pathspecs", "reset", "--", ...sortGitPaths(resetPaths)],
      {
        cwd: repoRoot,
        stdio: "pipe",
      },
    );
  }
}
