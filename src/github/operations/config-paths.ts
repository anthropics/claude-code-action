import * as core from "@actions/core";
import { mkdirSync, symlinkSync, writeFileSync } from "fs";
import { isAbsolute, posix, relative, resolve, sep } from "path";
import {
  ACCUMULATE_DELIMITER,
  parseClaudeArgsToExtraArgs,
} from "../../../base-action/src/parse-sdk-options";
import { SENSITIVE_PATHS } from "./restore-config";
import {
  fold,
  fsPath,
  git,
  hasRealParents,
  isFile,
  isLink,
  isSubmodule,
  onDisk,
  readBlobs,
  remove,
  snapshotForReview,
} from "./tool-config";
import type { Entry } from "./tool-config";

// The arguments that name config in files.
const FILE_FLAGS = new Set([
  "agents",
  "append-subagent-system-prompt-file",
  "append-system-prompt-file",
  "mcp-config",
  "plugin-dir",
  "plugin-dir-no-mcp",
  "settings",
  "system-prompt-file",
]);
// Only the project's config in this directory.
const PROJECT_FLAG = "project-config-root";
const MARKETPLACE_FILE = ".claude-plugin/marketplace.json";

// Git's entries by path, relative to the working directory. As in tool-config.ts,
// Latin-1 characters stand for bytes.
type Entries = Map<string, Entry>;

const toBytes = (path: string): string => Buffer.from(path).toString("latin1");
const toText = (path: string): string => fsPath(path).toString();
const isSameOrInside = (path: string, parent: string): boolean =>
  path === parent || path.startsWith(`${parent}/`);
const isSensitive = (path: string): boolean =>
  SENSITIVE_PATHS.some((sensitive) => isSameOrInside(path, sensitive));

// Each is "<mode> <other fields>\t<path>".
function parseEntries(listing: Buffer, oidField: number): Entries {
  const entries: Entries = new Map();
  for (const line of listing.toString("latin1").split("\0")) {
    const [info, path] = line.split(/\t(.*)/s);
    if (!info || !path) continue;
    const fields = info.split(" ");
    entries.set(path, { mode: fields[0]!, oid: fields[oidField]! });
  }
  return entries;
}

/**
 * A path as it is relative to the checkout, or undefined if it's outside. Links are not
 * followed, because the pull request can change them. The workspace can have another
 * name than the working directory, which is free of links.
 */
function inCheckout(path: string): string | undefined {
  const roots = [process.cwd(), process.env.GITHUB_WORKSPACE || process.cwd()];
  for (const root of roots) {
    const inRoot = relative(root, resolve(path));
    if (!isAbsolute(inRoot) && inRoot.split(sep)[0] !== "..") {
      return toBytes(inRoot.split(sep).join("/"));
    }
  }
  return undefined;
}

function isJson(value: string): boolean {
  if (!value.startsWith("{")) return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

const WHOLE_REPOSITORY =
  "The workflow takes a plugin from the whole repository, which can't come from a trusted branch on a pull request from an author without write access. Put the plugin in a subdirectory, or set restrict_untrusted_prs to false.";
const UNCLEAR_PATH =
  'A path in the workflow\'s inputs has ".." after another name, so it can\'t come from a trusted branch on a pull request from an author without write access. Write it without "..", or set restrict_untrusted_prs to false.';

const OTHER_SUBMODULE =
  "The pull request and the trusted branch have different commits of a submodule that the workflow's inputs name, so that branch's version can't be used. Bring the pull request up to date, put the files in the repository, or set restrict_untrusted_prs to false.";

class PathError extends Error {}

/**
 * Whether a path has ".." after a name in the checkout, which the pull request could
 * make a link.
 */
function goesBack(path: string): boolean {
  const parts = path.split(/[\\/]/);
  return parts.some(
    (part, index) =>
      part === ".." && !!inCheckout(parts.slice(0, index).join("/") || "/"),
  );
}

type NamedPaths = { paths: string[]; marketplaces: string[] };

/** The paths in this checkout that the workflow's inputs name as config. */
export function namedConfigPaths(claudeArgs: string): NamedPaths {
  const args = Object.entries(parseClaudeArgsToExtraArgs(claudeArgs)).flatMap(
    ([key, value]) => {
      const [flag, inlineValue] = key.split(/=(.*)/s);
      return [...(value?.split(ACCUMULATE_DELIMITER) ?? []), inlineValue ?? ""]
        .map((path) => path.trim())
        .flatMap((path) => (path ? [{ flag: flag!, path }] : []));
    },
  );
  const fromArgs = args.flatMap(({ flag, path }) =>
    flag === PROJECT_FLAG
      ? SENSITIVE_PATHS.map((name) => `${path}/${name}`)
      : FILE_FLAGS.has(flag)
        ? [path]
        : [],
  );
  const toPaths = (values: string[]): string[] =>
    values
      .map((value) => value.trim())
      .filter((value) => value && !isJson(value))
      .flatMap((value) => {
        if (goesBack(value)) throw new PathError(UNCLEAR_PATH);
        const path = inCheckout(value);
        return path === undefined ? [] : [path];
      });
  return {
    paths: toPaths([process.env.INPUT_SETTINGS ?? "", ...fromArgs]),
    marketplaces: toPaths(
      (process.env.INPUT_PLUGIN_MARKETPLACES ?? "")
        .split("\n")
        .filter((entry) => /^\s*((\.\.?)?\/|[a-z]:[\\/])/i.test(entry)),
    ),
  };
}

type RestoredPaths = { replaced: string[]; denyRules: string[] };

/**
 * On a pull request from an author without write access, takes the files that the
 * workflow's inputs name from the base branch. Links are restored but not followed. Only
 * files that the pull request changes, or whose .gitattributes it changes, are replaced,
 * so what an earlier step created or changed stays. restoreConfigFromBase must run
 * first, because it fetches the base branch. Like it, this changes the working tree and
 * not the index.
 *
 * @returns The paths that were replaced, all named by the base branch or the workflow,
 *   and rules that stop a session from editing these and the rest of that config.
 * @throws If the base branch's version can't be put in place.
 */
export function restoreConfigPathsFromBase(
  baseBranch: string,
  named: NamedPaths,
): RestoredPaths {
  if (named.paths.length + named.marketplaces.length === 0) {
    return { replaced: [], denyRules: [] };
  }
  let restored: RestoredPaths;
  try {
    restored = restoreConfigPaths(`refs/remotes/origin/${baseBranch}`, named);
  } catch (error) {
    if (error instanceof PathError) throw error;
    const { code, status } = error as { code?: string; status?: number };
    core.warning(
      `Could not replace config files (${code ?? `exit code ${status ?? "unknown"}`})`,
    );
    throw new Error(
      "Could not use the trusted branch's version of the files that the workflow's inputs name",
    );
  }
  if (restored.replaced.length > 0) {
    core.warning(
      `The pull request and ${baseBranch} differ in files that the workflow's inputs name (${restored.replaced.join(", ")}), so that branch's version is used and Claude can't edit it. See docs/security.md.`,
    );
  }
  return restored;
}

function restoreConfigPaths(ref: string, named: NamedPaths): RestoredPaths {
  const base = parseEntries(git(["ls-tree", "-r", "-z", ref]), 2);
  const pr = parseEntries(git(["ls-files", "--stage", "-z"]), 1);

  // The rest of Claude's config has been restored already.
  const targets = [
    ...named.paths,
    ...named.marketplaces.flatMap((path) => marketplacePaths(path, base)),
  ]
    .map((path) => posix.join(path || ".").replace(/\/$/, ""))
    .filter((path) => !isSameOrInside(path, "..") && !isSensitive(path));
  if (targets.includes(".")) throw new PathError(WHOLE_REPOSITORY);

  const replaced = replaceFiles([...new Set(targets)], base, pr).map(toText);
  return {
    replaced,
    denyRules: [...new Set([...targets.map(toText), ...replaced])]
      .map((path) => path.replace(/[\\*?[\]]/g, "\\$&"))
      .flatMap((path) => [`Edit(./${path})`, `Edit(./${path}/**)`]),
  };
}

/**
 * What a local marketplace is made of. One at the root of the repository has only its
 * own plugins in other directories.
 */
function marketplacePaths(path: string, base: Entries): string[] {
  const isManifest = path.endsWith(".json");
  // The CLI takes the directory above the manifest's as the marketplace's root.
  if (isManifest && !path.includes("/")) return [path];
  const root = isManifest
    ? posix.join(posix.dirname(path), "..")
    : path === ""
      ? "."
      : path;
  if (root !== ".") return [root];

  const manifest = isManifest ? path : MARKETPLACE_FILE;
  const own = isManifest ? path : posix.dirname(MARKETPLACE_FILE);
  const entry = base.get(manifest);
  // Without one that the base branch has, there is nothing to take plugins from.
  if (!entry || !isFile(entry)) return [own];
  const { plugins, metadata } = JSON.parse(
    readBlobs([entry])
      .get(entry.oid)!
      .toString()
      .replace(/^\uFEFF/, ""),
  ) as {
    plugins?: ({ source?: unknown } | null)[];
    metadata?: { pluginRoot?: unknown };
  };
  const pluginRoot =
    typeof metadata?.pluginRoot === "string" ? metadata.pluginRoot : "";
  const sources = (plugins ?? []).flatMap((plugin) =>
    typeof plugin?.source === "string" ? [plugin.source] : [],
  );
  return [
    own,
    ...sources.flatMap((source) =>
      // A bare name can be in the marketplace's plugin root.
      [source, ...(pluginRoot ? [posix.join(pluginRoot, source)] : [])].map(
        (dir) => toBytes(posix.join(".", dir)),
      ),
    ),
  ];
}

/**
 * Whether a path that differs from a target at most in case, or in how a character is
 * encoded, is in it or above it on this file system.
 */
function namesSameFile(name: string, target: string): boolean {
  const names = name.split("/");
  const targets = target.split("/");
  const spelled = [
    ...targets.slice(0, names.length),
    ...names.slice(targets.length),
  ].join("/");
  if (name === spelled) return true;
  const [stats, other] = [onDisk(name), onDisk(spelled)];
  return !!stats && !!other && stats.ino === other.ino;
}

/** The directories whose .gitattributes the pull request changes, ignoring case. */
function changedAttributes(base: Entries, pr: Entries): string[] {
  const names = new Set([...base.keys(), ...pr.keys()]);
  return [...names].flatMap((name) =>
    fold(posix.basename(name)) === ".gitattributes" &&
    base.get(name)?.oid !== pr.get(name)?.oid
      ? [fold(posix.dirname(name))]
      : [],
  );
}

const isInside = (name: string, foldedDir: string): boolean =>
  foldedDir === "." || fold(name).startsWith(`${foldedDir}/`);

/** Puts the base branch's version of these paths in place. Returns those that differed. */
function replaceFiles(targets: string[], base: Entries, pr: Entries): string[] {
  const foldedPr = [...pr.keys()].map((name) => [name, fold(name)] as const);
  const namesByTarget = new Map(
    targets.map((target) => {
      const folded = fold(target);
      const names = [
        ...[...base.keys()].filter(
          (name) =>
            isSameOrInside(name, target) || isSameOrInside(target, name),
        ),
        // A pull request can also have a file or link where the base branch has a
        // directory.
        ...foldedPr.flatMap(([name, other]) =>
          (isSameOrInside(other, folded) || isSameOrInside(folded, other)) &&
          namesSameFile(name, target)
            ? [name]
            : [],
        ),
      ];
      return [target, [...new Set(names)]] as const;
    }),
  );
  const attributes = changedAttributes(base, pr);
  const differs = (name: string): boolean => {
    const [ours, theirs] = [base.get(name), pr.get(name)];
    return (
      ours?.oid !== theirs?.oid ||
      ours?.mode !== theirs?.mode ||
      // Git can write even an unchanged file differently then.
      (isFile(theirs!) && attributes.some((dir) => isInside(name, dir)))
    );
  };
  const differing = [...namesByTarget].flatMap(([target, names]) => {
    // Names that differ only in case can be the same file.
    const folded = new Set(names.filter(differs).map(fold));
    const changed = names.filter((name) => folded.has(fold(name)));
    return changed.length > 0 ? [[target, changed] as const] : [];
  });
  const changed = [...new Set(differing.flatMap(([, names]) => names))];
  // Claude Code goes on without a plugin that is missing.
  if (changed.some((name) => base.has(name) && isSubmodule(base.get(name)!))) {
    throw new PathError(OTHER_SUBMODULE);
  }

  // All of these go before anything is written. A directory where the pull request has
  // a file or link came from an earlier step.
  const removed = new Set(
    changed.filter((name) => {
      const entry = pr.get(name);
      const stats = entry && onDisk(name);
      return (
        stats &&
        (!stats.isDirectory() || isSubmodule(entry)) &&
        hasRealParents(name)
      );
    }),
  );
  for (const name of removed) {
    const entry = pr.get(name)!;
    if (entry.oid !== base.get(name)?.oid) snapshotForReview(name, entry);
    remove(name);
  }

  // One that the pull request has but is not on disk was left out or deleted by the
  // workflow. What is on disk now came from an earlier step.
  const toWrite = changed.flatMap((name) => {
    const entry = base.get(name);
    const wanted = pr.has(name) ? removed.has(name) : true;
    return entry && !isSubmodule(entry) && wanted && !onDisk(name)
      ? [{ name, entry }]
      : [];
  });
  const blobs = readBlobs(toWrite.map(({ entry }) => entry));
  for (const { name, entry } of toWrite) {
    if (!hasRealParents(name)) continue;
    const content = blobs.get(entry.oid);
    if (!content) throw new Error("missing object");
    mkdirSync(fsPath(posix.dirname(name)), { recursive: true });
    if (isLink(entry)) symlinkSync(content, fsPath(name));
    else {
      const mode = entry.mode === "100755" ? 0o755 : 0o644;
      writeFileSync(fsPath(name), content, { mode, flag: "wx" });
    }
  }
  // Where the pull request has a file above a target, that is gone too.
  return [
    ...new Set(
      differing.flatMap(([target, names]) => [
        target,
        ...names.filter((name) => target.startsWith(`${name}/`)),
      ]),
    ),
  ];
}
