import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as core from "@actions/core";
import { execFileSync } from "child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import {
  namedConfigPaths,
  restoreConfigPathsFromBase,
} from "../src/github/operations/config-paths";
import { restoreConfigFromBase } from "../src/github/operations/restore-config";

const INPUTS = [
  "INPUT_SETTINGS",
  "INPUT_PLUGIN_MARKETPLACES",
  "GITHUB_WORKSPACE",
];

let originalCwd: string;
let tempDir: string;
let saved: Record<string, string | undefined>;
let warningSpy: any;

const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8", stdio: "pipe" }).trim();
const write = (path: string, content: string) => {
  mkdirSync(dirname(path), { recursive: true });
  rmSync(path, { recursive: true, force: true });
  writeFileSync(path, content);
};
const link = (path: string, target: string) => {
  mkdirSync(dirname(path), { recursive: true });
  rmSync(path, { recursive: true, force: true });
  symlinkSync(target, path);
};
const read = (path: string) => readFileSync(path, "utf8");
const commit = (message: string) => {
  git("add", "-A", "-f");
  git("commit", "-qm", message);
};

// Commits the base branch, pushes it and starts the pull request's branch from it.
const startPr = () => {
  commit("base");
  git("push", "-q", "origin", "main");
  git("checkout", "-qb", "pr");
};

const restoreAll = (named = { paths: [], marketplaces: [] } as any) => {
  restoreConfigFromBase("main");
  return restoreConfigPathsFromBase("main", named);
};
const named = (...paths: string[]) => ({ paths, marketplaces: [] as string[] });
const restore = (named?: any) => restoreAll(named).replaced;

beforeEach(() => {
  originalCwd = process.cwd();
  saved = Object.fromEntries(INPUTS.map((key) => [key, process.env[key]]));
  INPUTS.forEach((key) => delete process.env[key]);
  warningSpy = spyOn(core, "warning").mockImplementation(() => {});
  tempDir = mkdtempSync(join(tmpdir(), "config-paths-"));
  const remote = join(tempDir, "origin.git");
  const repo = join(tempDir, "repo");
  execFileSync("git", ["init", "-q", "--bare", remote]);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  process.chdir(repo);
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test User");
  git("remote", "add", "origin", remote);
  write("src/index.ts", "base\n");
});

afterEach(() => {
  process.chdir(originalCwd);
  warningSpy.mockRestore();
  rmSync(tempDir, { recursive: true, force: true });
  for (const key of INPUTS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("a named directory", () => {
  const inputs = () => namedConfigPaths("--plugin-dir ci/plugin");
  beforeEach(() => write("ci/plugin/a.json", "base\n"));

  test("is left alone if the pull request doesn't change it", () => {
    startPr();
    write("src/index.ts", "pr\n");
    commit("pr");

    expect(restore(inputs())).toEqual([]);
    expect(git("status", "--porcelain")).toBe("");
    expect(warningSpy).not.toHaveBeenCalled();
  });

  test("comes from the base branch, without what the pull request adds", () => {
    startPr();
    write("ci/plugin/a.json", "pr\n");
    write("ci/plugin/b.json", "pr\n");
    write("src/index.ts", "pr\n");
    commit("pr");
    write("ci/plugin/generated.json", "by an earlier step\n");

    expect(restore(inputs())).toEqual(["ci/plugin"]);

    expect(read("ci/plugin/a.json")).toBe("base\n");
    expect(existsSync("ci/plugin/b.json")).toBe(false);
    expect(read("ci/plugin/generated.json")).toBe("by an earlier step\n");
    expect(read("src/index.ts")).toBe("pr\n");
    expect(read(".claude-pr/ci/plugin/a.json")).toBe("pr\n");
    // Nothing is staged, so a commit doesn't include it.
    expect(git("diff", "--cached", "--name-only")).toBe("");
    expect(warningSpy.mock.calls[0][0]).toContain("ci/plugin");
  });

  test.each(["ci", "ci/plugin", "ci/plugin/a.json"])(
    "is put back if the pull request has a link at %s",
    (path) => {
      startPr();
      write(join(tempDir, "outside", "keep"), "untouched\n");
      rmSync(path, { recursive: true });
      link(path, join(tempDir, "outside"));
      commit("pr");

      expect(restore(inputs()).sort()).toEqual(
        path === "ci" ? ["ci", "ci/plugin"] : ["ci/plugin"],
      );
      expect(read("ci/plugin/a.json")).toBe("base\n");
      expect(read(join(tempDir, "outside", "keep"))).toBe("untouched\n");
    },
  );

  test("is put back if the pull request has a file in its parent's place", () => {
    startPr();
    rmSync("ci", { recursive: true });
    write("ci", "pr\n");
    commit("pr");

    expect(restore(inputs()).sort()).toEqual(["ci", "ci/plugin"]);
    expect(read("ci/plugin/a.json")).toBe("base\n");
  });

  test("is put back if the pull request makes its parent a submodule", () => {
    startPr();
    git("rm", "-rq", "ci");
    git(
      "update-index",
      "--add",
      "--cacheinfo",
      `160000,${git("rev-parse", "HEAD")},ci`,
    );
    git("commit", "-qm", "pr");
    mkdirSync("ci");

    expect(restore(inputs()).sort()).toEqual(["ci", "ci/plugin"]);
    expect(read("ci/plugin/a.json")).toBe("base\n");
  });

  test("keeps its own links, and loses the pull request's", () => {
    link("ci/plugin/hooks", "../hooks");
    startPr();
    link("ci/plugin/hooks", "../evil");
    link("ci/plugin/more", "../evil");
    commit("pr");

    expect(restore(inputs())).toEqual(["ci/plugin"]);
    expect(readlinkSync("ci/plugin/hooks")).toBe("../hooks");
    expect(lstatSync("ci/plugin/more", { throwIfNoEntry: false })).toBe(
      undefined,
    );
  });
});

test("a file that an earlier step created stays", () => {
  startPr();
  write("generated/settings.json", "by an earlier step\n");

  expect(restore(named("generated/settings.json"))).toEqual([]);
  expect(read("generated/settings.json")).toBe("by an earlier step\n");
});

test("a link that the pull request puts above a missing path is removed", () => {
  startPr();
  write("evil/settings.json", "pr\n");
  link("generated", "evil");
  commit("pr");

  expect(restore(named("generated/settings.json")).sort()).toEqual([
    "generated",
    "generated/settings.json",
  ]);
  expect(existsSync("generated/settings.json")).toBe(false);
});

test("a submodule that the pull request moves stops the run", () => {
  const add = (oid: string) =>
    git("update-index", "--add", "--cacheinfo", `160000,${oid},vendor`);
  commit("first");
  add(git("rev-parse", "HEAD"));
  git("commit", "-qm", "base");
  git("push", "-q", "origin", "main");
  git("checkout", "-qb", "pr");
  const inputs = namedConfigPaths("--plugin-dir vendor/plugin");
  expect(restore(inputs)).toEqual([]);

  add(git("rev-parse", "HEAD"));
  git("commit", "-qm", "pr");
  expect(() => restore(inputs)).toThrow("different commits of a submodule");
});

test("the base branch's link above a named path is put back", () => {
  write("tools/ci/plugin/a.json", "base\n");
  link("ci", "tools/ci");
  startPr();
  rmSync("ci");
  write("ci/plugin/a.json", "pr\n");
  commit("pr");

  expect(restore(named("ci/plugin")).sort()).toEqual(["ci", "ci/plugin"]);
  expect(readlinkSync("ci")).toBe("tools/ci");
  expect(read("ci/plugin/a.json")).toBe("base\n");
});

test.each(["working-tree-encoding=UTF-16", "text eol=crlf", "ident"])(
  "a .gitattributes can't make git write a file differently: %s",
  (attribute) => {
    write("ci/a.sh", "base $Id$\n");
    write("ci/b.sh", "base\n");
    startPr();
    write("ci/b.sh", "pr\n");
    commit("pr");
    write(".gitattributes", `*.sh ${attribute}\n`);
    git("add", ".gitattributes");
    git("commit", "-qm", "attributes");
    rmSync("ci", { recursive: true });
    git("checkout", "-q", "--", "ci");
    expect(read("ci/a.sh")).not.toBe("base $Id$\n");

    expect(restore(named("ci/a.sh", "ci/b.sh")).sort()).toEqual([
      "ci/a.sh",
      "ci/b.sh",
    ]);
    expect(read("ci/a.sh")).toBe("base $Id$\n");
    expect(read("ci/b.sh")).toBe("base\n");
  },
);

test("the base branch's own .gitattributes are left alone", () => {
  write("ci/a.sh", "base\n");
  write(".gitattributes", "*.sh text eol=crlf\n");
  write("other/.gitattributes", "");
  startPr();
  write("other/.gitattributes", "* text\n");
  commit("pr");
  rmSync("ci", { recursive: true });
  git("checkout", "-q", "--", "ci");

  expect(restore(named("ci/a.sh"))).toEqual([]);
  expect(read("ci/a.sh")).toBe("base\r\n");
});

test("what an earlier step changed stays if the pull request doesn't change it", () => {
  write("ci/plugin/dist.js", "base\n");
  write("ci/plugin/a.json", "base\n");
  startPr();
  write("ci/plugin/a.json", "pr\n");
  commit("pr");
  write("ci/plugin/dist.js", "by an earlier step\n");

  expect(restore(namedConfigPaths("--plugin-dir ci/plugin"))).toEqual([
    "ci/plugin",
  ]);
  expect(read("ci/plugin/dist.js")).toBe("by an earlier step\n");
  expect(read("ci/plugin/a.json")).toBe("base\n");
});

test("a link that leads out of the checkout can't become a file", () => {
  link("ci/mcp.json", "/opt/shared/mcp.json");
  startPr();
  write("ci/mcp.json", "pr\n");
  commit("pr");

  expect(restore(named("ci/mcp.json"))).toEqual(["ci/mcp.json"]);
  expect(readlinkSync("ci/mcp.json")).toBe("/opt/shared/mcp.json");
});

test("a path can't go back through a directory", () => {
  for (const path of [
    "tools/../ci/s.json",
    "./a/b/../../s.json",
    "a/./../s",
    "tools/../../shared/s.json",
    join(process.cwd(), "tools") + "/../s.json",
  ]) {
    process.env.INPUT_SETTINGS = path;
    expect(() => namedConfigPaths("")).toThrow('Write it without ".."');
  }
  for (const path of [
    "./ci/..s.json",
    "a..b/s",
    "../outside/../s.json",
    process.cwd() + "/../s.json",
  ]) {
    process.env.INPUT_SETTINGS = path;
    namedConfigPaths("");
  }
});

test("a name that differs in case is another file where the file system says so", () => {
  write("docs/guide.md", "base\n");
  write("Docs/guide.md/readme", "base\n");
  const isCaseSensitive = read("docs/guide.md") === "base\n";
  startPr();
  if (!isCaseSensitive) return;
  write("Docs/guide.md/readme", "pr\n");
  commit("pr");

  expect(restore(named("docs/guide.md"))).toEqual([]);
  expect(read("Docs/guide.md/readme")).toBe("pr\n");
});

test("names with glob characters are literal in the rules", () => {
  write("plugins/[ci]/x", "base\n");
  startPr();
  write("plugins/[ci]/x", "pr\n");
  commit("pr");
  expect(
    restoreAll(namedConfigPaths("--plugin-dir 'plugins/[ci]'")).denyRules,
  ).toEqual(["Edit(./plugins/\\[ci\\])", "Edit(./plugins/\\[ci\\]/**)"]);
});

test("a workspace reached through a link is the same checkout", () => {
  write("ci/mcp.json", "base\n");
  const workspace = join(tempDir, "workspace");
  symlinkSync(process.cwd(), workspace);
  process.env.GITHUB_WORKSPACE = workspace;
  startPr();
  write("ci/mcp.json", "pr\n");
  commit("pr");

  expect(
    restore(namedConfigPaths(`--mcp-config ${workspace}/ci/mcp.json`)),
  ).toEqual(["ci/mcp.json"]);
  expect(read("ci/mcp.json")).toBe("base\n");
});

test("a session can't edit what the inputs name, changed or not", () => {
  write("ci/plugin/check.sh", "base\n");
  write("ci/s.json", "base\n");
  startPr();
  write("ci/s.json", "pr\n");
  commit("pr");

  const { replaced, denyRules } = restoreAll(
    namedConfigPaths("--plugin-dir ci/plugin --settings ci/s.json"),
  );
  expect(replaced).toEqual(["ci/s.json"]);
  expect(denyRules.sort()).toEqual([
    "Edit(./ci/plugin)",
    "Edit(./ci/plugin/**)",
    "Edit(./ci/s.json)",
    "Edit(./ci/s.json/**)",
  ]);
});

test("what nothing names stays, also if Claude's config links to it", () => {
  write("docs/guide.md", "base\n");
  link("CLAUDE.md", "docs/guide.md");
  startPr();
  write("docs/guide.md", "pr\n");
  commit("pr");

  expect(restoreAll(namedConfigPaths("--model m"))).toEqual({
    replaced: [],
    denyRules: [],
  });
});

describe("what the workflow's inputs name", () => {
  test("comes from the base branch, or is removed if only the pull request has it", () => {
    write("ci/settings.json", "base\n");
    write("ci/plugin/hooks/hooks.json", "base\n");
    startPr();
    write("ci/settings.json", "pr\n");
    write("ci/plugin/hooks/hooks.json", "pr\n");
    write("ci/mcp.json", "pr\n");
    write("ci/other.json", "pr\n");
    commit("pr");
    process.env.INPUT_SETTINGS = "ci/settings.json";

    const named = namedConfigPaths(
      "--mcp-config ci/mcp.json --plugin-dir ./ci/plugin",
    );
    expect(restore(named).sort()).toEqual([
      "ci/mcp.json",
      "ci/plugin",
      "ci/settings.json",
    ]);

    expect(read("ci/settings.json")).toBe("base\n");
    expect(read("ci/plugin/hooks/hooks.json")).toBe("base\n");
    expect(existsSync("ci/mcp.json")).toBe(false);
    expect(read("ci/other.json")).toBe("pr\n");
  });

  test("can't be the whole repository", () => {
    startPr();
    write("hooks/hooks.json", "pr\n");
    commit("pr");

    expect(() => restore(namedConfigPaths("--plugin-dir ."))).toThrow(
      "Put the plugin in a subdirectory",
    );
  });

  test("is the manifest and the plugins of a marketplace at the root", () => {
    write(
      ".claude-plugin/marketplace.json",
      JSON.stringify({
        metadata: { pluginRoot: "./more" },
        plugins: [
          { name: "a", source: "./plugins/a/" },
          { name: "b", source: "b" },
          { name: "d", source: "../d" },
          { name: "c", source: { source: "github", repo: "o/c" } },
        ],
      }),
    );
    write("plugins/a/hooks/hooks.json", "base\n");
    write("more/b/hooks/hooks.json", "base\n");
    startPr();
    write(
      ".claude-plugin/marketplace.json",
      JSON.stringify({ plugins: [{ name: "a", source: "./evil" }] }),
    );
    write("plugins/a/hooks/hooks.json", "pr\n");
    write("more/b/hooks/hooks.json", "pr\n");
    commit("pr");
    process.env.INPUT_PLUGIN_MARKETPLACES = "https://example.com/x.git\n./\n";

    expect(restore(namedConfigPaths("")).sort()).toEqual([
      ".claude-plugin",
      "more/b",
      "plugins/a",
    ]);
    expect(read("plugins/a/hooks/hooks.json")).toBe("base\n");
    expect(read("more/b/hooks/hooks.json")).toBe("base\n");
    expect(read(".claude-plugin/marketplace.json")).not.toContain("evil");
    expect(read("src/index.ts")).toBe("base\n");
  });

  test.each([
    ["ci/marketplace.json", "ci/marketplace.json"],
    ["./", ".claude-plugin/marketplace.json"],
  ])("finds the plugins of a marketplace at %s", (input, path) => {
    const manifest = JSON.stringify({
      plugins: [{ name: "a", source: "./plugins/a" }],
    });
    write(path, manifest);
    write("plugins/a/hooks/hooks.json", "base\n");
    startPr();
    write("plugins/a/hooks/hooks.json", "pr\n");
    commit("pr");
    process.env.INPUT_PLUGIN_MARKETPLACES = input.startsWith(".")
      ? input
      : `./${input}`;

    expect(restore(namedConfigPaths(""))).toEqual(["plugins/a"]);
    expect(read("plugins/a/hooks/hooks.json")).toBe("base\n");
  });

  test("is a whole marketplace in a directory", () => {
    write("market/.claude-plugin/marketplace.json", "base\n");
    write("market/a/hooks.json", "base\n");
    startPr();
    write("market/a/hooks.json", "pr\n");
    commit("pr");
    for (const input of [
      "./market",
      "./market/.claude-plugin/marketplace.json",
    ]) {
      process.env.INPUT_PLUGIN_MARKETPLACES = input;
      expect(restore(namedConfigPaths(""))).toEqual(["market"]);
      expect(read("market/a/hooks.json")).toBe("base\n");
      git("checkout", "-q", "--", "market");
    }
  });

  test("can't be a plugin that is the whole repository", () => {
    write(
      ".claude-plugin/marketplace.json",
      JSON.stringify({ plugins: [{ name: "a", source: "./" }] }),
    );
    startPr();
    process.env.INPUT_PLUGIN_MARKETPLACES = "./";

    expect(() => restore(namedConfigPaths(""))).toThrow(
      "Put the plugin in a subdirectory",
    );
  });
});

describe("namedConfigPaths", () => {
  test("finds paths in every input that names files", () => {
    process.env.INPUT_SETTINGS = " .github/settings.json ";
    process.env.INPUT_PLUGIN_MARKETPLACES =
      "./market\n../outside\n/elsewhere\n";
    expect(
      namedConfigPaths(
        `--mcp-config '{"mcpServers":{}}' a.json b.json
         --plugin-dir=plugin --settings '{"a":1}' --agents agents.json
         --append-system-prompt-file p.md --system-prompt-file ../x.md
         --plugin-dir-no-mcp 2024 --append-subagent-system-prompt-file q.md
         --setting-sources user --json-schema '{}'
         --allowedTools Read --model m`,
      ),
    ).toEqual({
      paths: [
        ".github/settings.json",
        "a.json",
        "b.json",
        "plugin",
        "agents.json",
        "p.md",
        "2024",
        "q.md",
      ],
      marketplaces: ["market"],
    });
  });

  test("finds the project config in a --project-config-root", () => {
    startPr();
    const { paths } = namedConfigPaths("--project-config-root app");
    expect(paths).toContain("app/.claude");
    expect(paths).toContain("app/.mcp.json");
    expect(paths).not.toContain("app");
    expect(restore(namedConfigPaths(`--project-config-root .`))).toEqual([]);
  });

  test("finds nothing in inputs that name no files in the checkout", () => {
    process.env.INPUT_SETTINGS = '{"permissions":{}}';
    process.env.INPUT_PLUGIN_MARKETPLACES = "https://example.com/x.git";
    expect(namedConfigPaths("--mcp-config /etc/mcp.json --settings")).toEqual({
      paths: [],
      marketplaces: [],
    });
  });
});
