import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import {
  toolConfigDenyRules,
  restoreToolConfigFromBase,
} from "../src/github/operations/tool-config";
import { restoreConfigFromBase } from "../src/github/operations/restore-config";

describe("restoreToolConfigFromBase", () => {
  let originalCwd: string;
  let tempDir: string;

  const git = (...args: string[]) =>
    execFileSync("git", args, { encoding: "utf8", stdio: "pipe" }).trim();
  const write = (path: string, content: string, executable = false) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    if (executable) chmodSync(path, 0o755);
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

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = mkdtempSync(join(tmpdir(), "tool-config-"));
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
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("does nothing when the pull request has the same tool config", () => {
    write(".npmrc", "base\n");
    write("package.json", '{"name":"x","bin":"cli.js"}');
    startPr();
    write("src/index.ts", "pr\n");
    commit("pr");

    expect(restoreToolConfigFromBase("main")).toEqual([]);

    expect(git("status", "--porcelain")).toBe("");
    expect(existsSync(".claude-pr")).toBe(false);
  });

  test("uses the base version of a changed file, and removes an added one", () => {
    write(".npmrc", "base\n");
    startPr();
    write(".npmrc", "pr\n");
    write("bunfig.toml", "pr\n");
    write("node_modules/.bin/node", "#!/bin/sh\n", true);
    commit("pr");

    expect(restoreToolConfigFromBase("main").sort()).toEqual([
      ".npmrc",
      "bunfig.toml",
      "node_modules",
    ]);

    expect(read(".npmrc")).toBe("base\n");
    expect(existsSync("bunfig.toml")).toBe(false);
    expect(existsSync("node_modules")).toBe(false);
    expect(read(".claude-pr/.npmrc")).toBe("pr\n");
    // Nothing is staged, so the pull request's versions are still what git has.
    expect(git("diff", "--cached", "--name-only")).toBe("");
  });

  test("brings back a file the pull request deleted", () => {
    write(".npmrc", "base\n");
    write("node_modules/.bin/tool", "base\n", true);
    startPr();
    rmSync(".npmrc");
    rmSync("node_modules", { recursive: true });
    commit("pr");

    restoreToolConfigFromBase("main");

    expect(read(".npmrc")).toBe("base\n");
    expect(read("node_modules/.bin/tool")).toBe("base\n");
    expect(lstatSync("node_modules/.bin/tool").mode & 0o111).not.toBe(0);
  });

  test("leaves untracked files that an earlier step created", () => {
    write("bunfig.toml", "base\n");
    startPr();
    rmSync("bunfig.toml");
    write(".npmrc.example", "pr\n");
    commit("pr");
    write("bunfig.toml", "from a step\n");
    write(".npmrc", "from a step\n");
    write("node_modules/.bin/tool", "installed\n", true);

    expect(restoreToolConfigFromBase("main")).toEqual([]);

    expect(read("bunfig.toml")).toBe("from a step\n");
    expect(read(".npmrc")).toBe("from a step\n");
    expect(read("node_modules/.bin/tool")).toBe("installed\n");
  });

  test("keeps a step's change to a file the pull request leaves alone", () => {
    write(".npmrc", "base\n");
    startPr();
    write("src/index.ts", "pr\n");
    commit("pr");
    write(".npmrc", "base\nfrom a step\n");

    expect(restoreToolConfigFromBase("main")).toEqual([]);

    expect(read(".npmrc")).toBe("base\nfrom a step\n");
  });

  test("keeps a file deleted by an earlier step deleted", () => {
    write(".npmrc", "base\n");
    startPr();
    write(".npmrc", "pr\n");
    commit("pr");
    rmSync(".npmrc");

    expect(restoreToolConfigFromBase("main")).toEqual([]);

    expect(existsSync(".npmrc")).toBe(false);
  });

  test("leaves a directory an earlier step put in a tracked link's place", () => {
    startPr();
    symlinkSync("elsewhere", "node_modules");
    commit("pr");
    rmSync("node_modules");
    write("node_modules/tool/a", "installed\n");

    expect(restoreToolConfigFromBase("main")).toEqual([]);

    expect(read("node_modules/tool/a")).toBe("installed\n");
  });

  test("leaves files that a sparse checkout leaves out", () => {
    write("node_modules/tool/a", "base\n");
    startPr();
    write("node_modules/tool/a", "pr\n");
    commit("pr");
    git("sparse-checkout", "set", "src");

    expect(restoreToolConfigFromBase("main")).toEqual([]);

    expect(existsSync("node_modules/tool/a")).toBe(false);
  });

  test("replaces links without following them", () => {
    write("node_modules/.bin/tool", "base\n", true);
    startPr();
    const outside = join(tempDir, "outside");
    write(join(outside, ".bin/tool"), "outside\n");
    rmSync("node_modules", { recursive: true });
    symlinkSync(outside, "node_modules");
    symlinkSync(join(outside, ".bin/tool"), ".npmrc");
    commit("pr");

    restoreToolConfigFromBase("main");

    expect(lstatSync("node_modules").isDirectory()).toBe(true);
    expect(read("node_modules/.bin/tool")).toBe("base\n");
    expect(existsSync(".npmrc")).toBe(false);
    expect(read(join(outside, ".bin/tool"))).toBe("outside\n");
  });

  test("writes and removes nothing through a link an earlier step added", () => {
    write("node_modules/a/b", "base\n");
    write("node_modules/c/d", "base\n");
    startPr();
    write("node_modules/a/b", "pr\n");
    rmSync("node_modules/c", { recursive: true });
    commit("pr");
    const outside = join(tempDir, "outside");
    write(join(outside, "a/b"), "outside\n");
    rmSync("node_modules", { recursive: true });
    symlinkSync(outside, "node_modules");

    expect(restoreToolConfigFromBase("main")).toEqual([]);

    expect(read(join(outside, "a/b"))).toBe("outside\n");
    expect(existsSync(join(outside, "c"))).toBe(false);
  });

  test("brings back a link the base branch has", () => {
    write("node_modules/tool/cli.js", "base\n");
    mkdirSync("node_modules/.bin");
    symlinkSync("../tool/cli.js", "node_modules/.bin/tool");
    startPr();
    rmSync("node_modules/.bin/tool");
    write("node_modules/.bin/tool", "pr\n", true);
    commit("pr");

    restoreToolConfigFromBase("main");

    expect(readlinkSync("node_modules/.bin/tool")).toBe("../tool/cli.js");
  });

  test("replaces a directory the pull request puts in a file's place", () => {
    write(".npmrc", "base\n");
    startPr();
    rmSync(".npmrc");
    write(".npmrc/keep", "pr\n");
    commit("pr");

    restoreToolConfigFromBase("main");

    expect(read(".npmrc")).toBe("base\n");
  });

  test("replaces a directory that holds a package.json too", () => {
    write(".npmrc", "base\n");
    startPr();
    rmSync(".npmrc");
    write(".npmrc/package.json", "{}");
    commit("pr");

    restoreToolConfigFromBase("main");

    expect(read(".npmrc")).toBe("base\n");
  });

  test("rewrites an unchanged file that .gitattributes re-encodes", () => {
    write(".npmrc", "ignore-scripts=true\n");
    startPr();
    write(".gitattributes", ".npmrc working-tree-encoding=UTF-16LE-BOM\n");
    git("add", ".gitattributes");
    git("commit", "-qm", "pr");
    expect(git("rev-parse", "HEAD:.npmrc")).toBe(
      git("rev-parse", "main:.npmrc"),
    );
    rmSync(".npmrc");
    git("checkout", "--", ".npmrc");
    expect(read(".npmrc")).not.toBe("ignore-scripts=true\n");

    expect(restoreToolConfigFromBase("main")).toEqual([".npmrc"]);

    expect(read(".npmrc")).toBe("ignore-scripts=true\n");
  });

  test("sees re-encoding when .gitattributes is re-encoded too", () => {
    write(".npmrc", "ignore-scripts=true\n");
    startPr();
    const encoding = "working-tree-encoding=UTF-16LE-BOM";
    write(".gitattributes", `.npmrc ${encoding}\n.gitattributes ${encoding}\n`);
    const oid = git("hash-object", "-w", "--no-filters", ".gitattributes");
    git("update-index", "--add", "--cacheinfo", `100644,${oid},.gitattributes`);
    git("commit", "-qm", "pr");
    rmSync(".npmrc");
    rmSync(".gitattributes");
    git("checkout", "--", ".");
    expect(read(".npmrc")).not.toBe("ignore-scripts=true\n");
    expect(read(".gitattributes")).not.toContain(encoding);

    expect(restoreToolConfigFromBase("main")).toEqual([".npmrc"]);

    expect(read(".npmrc")).toBe("ignore-scripts=true\n");
  });

  test("sees re-encoding by a .gitattributes that is only on disk", () => {
    write(".npmrc", "ignore-scripts=true\n");
    startPr();
    write("f.txt", "pr\n");
    commit("pr");
    write(".gitattributes", ".npmrc working-tree-encoding=UTF-16LE-BOM\n");
    rmSync(".npmrc");
    git("checkout", "--", ".npmrc");
    expect(read(".npmrc")).not.toBe("ignore-scripts=true\n");

    expect(restoreToolConfigFromBase("main")).toEqual([".npmrc"]);

    expect(read(".npmrc")).toBe("ignore-scripts=true\n");
  });

  test("matches names without regard to case", () => {
    write(".npmrc", "base\n");
    startPr();
    write("BUNFIG.toml", "pr\n");
    write("Node_Modules/.bin/node", "pr\n");
    commit("pr");

    restoreToolConfigFromBase("main");

    expect(existsSync("BUNFIG.toml")).toBe(false);
    expect(existsSync("Node_Modules/.bin/node")).toBe(false);
  });

  test("writes the base version as it is, whatever .gitattributes says", () => {
    write(".npmrc", "ignore-scripts=true\n");
    startPr();
    write(".npmrc", "pr\n");
    commit("pr");
    write(".gitattributes", ".npmrc working-tree-encoding=UTF-16LE-BOM\n");

    restoreToolConfigFromBase("main");

    expect(read(".npmrc")).toBe("ignore-scripts=true\n");
  });

  test("keeps binary and empty content intact", () => {
    const content = Buffer.from([0, 10, 255, 10, 13, 0]);
    mkdirSync("node_modules");
    writeFileSync("node_modules/a", content);
    writeFileSync("node_modules/b", "");
    writeFileSync("node_modules/c", "no newline");
    startPr();
    for (const name of ["a", "b", "c"]) write(`node_modules/${name}`, "pr");
    commit("pr");

    restoreToolConfigFromBase("main");

    expect(readFileSync("node_modules/a").equals(content)).toBe(true);
    expect(read("node_modules/b")).toBe("");
    expect(read("node_modules/c")).toBe("no newline");
  });

  test("reports names from a fixed list, not the pull request's file names", () => {
    startPr();
    write("node_modules/a\n::stop-commands::x", "pr\n");
    commit("pr");

    const names = restoreToolConfigFromBase("main");

    expect(names).toEqual(["node_modules"]);
    expect(existsSync("node_modules")).toBe(false);
  });

  test("handles names that are not valid UTF-8", () => {
    startPr();
    const name = Buffer.from([...Buffer.from("node_modules/"), 0xff]);
    mkdirSync("node_modules");
    try {
      writeFileSync(name, "pr\n");
    } catch {
      return; // This file system refuses such names.
    }
    commit("pr");

    restoreToolConfigFromBase("main");

    expect(existsSync(name)).toBe(false);
  });

  test("is not misled by a local branch with the base's name", () => {
    write(".npmrc", "base\n");
    startPr();
    write(".npmrc", "pr\n");
    commit("pr");
    git("branch", "origin/main");

    restoreToolConfigFromBase("main");

    expect(read(".npmrc")).toBe("base\n");
  });

  test("works in a checkout with no remote-tracking branch for the base", () => {
    write(".npmrc", "base\n");
    startPr();
    write(".npmrc", "pr\n");
    commit("pr");
    git("fetch", "-q", "origin", "main");
    git("update-ref", "-d", "refs/remotes/origin/main");

    restoreToolConfigFromBase("main");

    expect(read(".npmrc")).toBe("base\n");
  });

  test("stops edits to tool config, and to package.json only if replaced", () => {
    const rules = [
      "Edit(./.npmrc)",
      "Edit(./bunfig.toml)",
      "Edit(./node_modules/**)",
    ];
    expect(toolConfigDenyRules([])).toEqual(rules);
    expect(toolConfigDenyRules(["package.json"])).toEqual([
      ...rules,
      "Edit(package.json)",
    ]);
  });

  test("matches names a file system can treat as the same", () => {
    startPr();
    write("node_module\u017F/.bin/node", "pr\n");
    commit("pr");

    expect(restoreToolConfigFromBase("main")).toEqual(["node_modules"]);
  });

  test("fails without naming a file if the base version can't be read", () => {
    write(".npmrc", "base\n");
    startPr();
    write(".npmrc", "pr\n");
    commit("pr");
    const oid = git("rev-parse", "main:.npmrc");
    rmSync(join(".git/objects", oid.slice(0, 2), oid.slice(2)));

    expect(() => restoreToolConfigFromBase("main")).toThrow(
      /^Could not use the base branch's version/,
    );
    expect(existsSync(".npmrc")).toBe(false);
  });

  describe("package.json", () => {
    const baseJson = { name: "x", bin: { x: "x.js" }, version: "1.0.0" };
    const start = (pr: unknown) => {
      write("package.json", JSON.stringify(baseJson));
      startPr();
      write("package.json", typeof pr === "string" ? pr : JSON.stringify(pr));
      commit("pr");
    };

    test("keeps the pull request's version when only other fields change", () => {
      const pr = { ...baseJson, version: "2.0.0", dependencies: { a: "1" } };
      start(pr);
      expect(restoreToolConfigFromBase("main")).toEqual([]);
      expect(JSON.parse(read("package.json"))).toEqual(pr);
    });

    test("keeps the pull request's version when it removes the commands", () => {
      start({ name: "x" });
      expect(restoreToolConfigFromBase("main")).toEqual([]);
    });

    test.each([
      ["bin", { bin: { "tool@latest": "a.js" } }],
      ["directories", { directories: { bin: "bin" } }],
      ["name", { name: "tool" }],
      ["workspaces", { workspaces: ["pkgs/*"] }],
    ])("uses only the base's commands when %s changes", (_, change) => {
      const pr = { ...baseJson, ...change, dependencies: { a: "1" } };
      start(pr);
      expect(restoreToolConfigFromBase("main")).toEqual(["package.json"]);
      expect(JSON.parse(read("package.json"))).toEqual({
        ...baseJson,
        dependencies: { a: "1" },
      });
      expect(JSON.parse(read(".claude-pr/package.json"))).toEqual(pr);
    });

    describe("that .gitattributes converts", () => {
      const commitRaw = (attributes: string, stored: string) => {
        write(".gitattributes", `package.json ${attributes}\n`);
        write("package.json", stored);
        const oid = git("hash-object", "-w", "--no-filters", "package.json");
        git("add", ".gitattributes");
        git("update-index", "--cacheinfo", `100644,${oid},package.json`);
        git("commit", "-qm", "pr");
        rmSync("package.json");
        git("checkout", "--", "package.json");
      };
      const startFromBase = () => {
        write("package.json", JSON.stringify(baseJson));
        startPr();
      };

      test("replaces commands that are only on disk", () => {
        startFromBase();
        commitRaw(
          "ident",
          '{"name":"x","a":"$Id:","b":{"c":"$","bin":{"x":"pr.js"},"d":"$Id:"},"e":"$"}',
        );
        expect(JSON.parse(read("package.json")).bin).toEqual({ x: "pr.js" });

        expect(restoreToolConfigFromBase("main")).toEqual(["package.json"]);

        expect(JSON.parse(read("package.json")).bin).toEqual(baseJson.bin);
      });

      test("replaces one that can't be understood", () => {
        startFromBase();
        commitRaw(
          "working-tree-encoding=UTF-16LE-BOM",
          JSON.stringify(baseJson),
        );

        expect(restoreToolConfigFromBase("main")).toEqual(["package.json"]);

        expect(JSON.parse(read("package.json"))).toEqual(baseJson);
      });

      test("replaces commands that aren't on disk", () => {
        startFromBase();
        commitRaw(
          "ident",
          '{"name":"x","a":"$Id: ","bin":{"x":"pr.js"},"b":" $"}',
        );
        expect(JSON.parse(read("package.json")).bin).toBeUndefined();

        expect(restoreToolConfigFromBase("main")).toEqual(["package.json"]);
      });

      test("keeps a step's change to one that the pull request leaves alone", () => {
        write(".gitattributes", "* ident\n");
        startFromBase();
        write("f.txt", "pr\n");
        commit("pr");
        const changed = JSON.stringify({ ...baseJson, name: "@scope/x" });
        write("package.json", changed);

        expect(restoreToolConfigFromBase("main")).toEqual([]);

        expect(read("package.json")).toBe(changed);
      });

      test("keeps one whose encoding is no conversion", () => {
        startFromBase();
        const pr = JSON.stringify({ ...baseJson, version: "2.0.0" });
        commitRaw("working-tree-encoding=UTF-8", pr);

        expect(restoreToolConfigFromBase("main")).toEqual([]);
      });

      test("keeps what a step changed in one that is not converted", () => {
        startFromBase();
        write(
          "package.json",
          JSON.stringify({ ...baseJson, version: "2.0.0" }),
        );
        commit("pr");
        const changed = JSON.stringify({ ...baseJson, name: "@scope/x" });
        write("package.json", changed);

        expect(restoreToolConfigFromBase("main")).toEqual([]);

        expect(read("package.json")).toBe(changed);
      });

      test("keeps one with the same commands", () => {
        startFromBase();
        const pr = JSON.stringify({ ...baseJson, version: "2.0.0" });
        commitRaw("ident", pr);

        expect(restoreToolConfigFromBase("main")).toEqual([]);

        expect(read("package.json")).toBe(pr);
      });
    });

    test("keeps a new name if directories holds no commands", () => {
      const directories = { test: "test" };
      write("package.json", JSON.stringify({ name: "x", directories }));
      startPr();
      const pr = JSON.stringify({ name: "y", directories: { test: "t" } });
      write("package.json", pr);
      commit("pr");

      expect(restoreToolConfigFromBase("main")).toEqual([]);

      expect(read("package.json")).toBe(pr);
    });

    test.each([[null], ["bin"], [["bin"]], [1]])(
      "copes with directories being %p",
      (directories) => {
        start({ name: "y", directories });
        expect(restoreToolConfigFromBase("main")).toEqual([]);
      },
    );

    test("uses the base version when it can't be understood", () => {
      start("{");
      restoreToolConfigFromBase("main");
      expect(JSON.parse(read("package.json"))).toEqual(baseJson);
    });

    test("understands a byte order mark", () => {
      start(`\uFEFF${JSON.stringify({ ...baseJson, version: "2.0.0" })}`);
      expect(restoreToolConfigFromBase("main")).toEqual([]);
    });

    test("looks in subdirectories only if the base branch has workspaces", () => {
      const tool = JSON.stringify({ name: "tool", bin: "x.js", version: "1" });
      startPr();
      write("pkgs/p/package.json", tool);
      commit("pr");
      expect(restoreToolConfigFromBase("main")).toEqual([]);

      git("checkout", "-q", "main");
      write("package.json", '{"name":"x","workspaces":["pkgs/*"]}');
      commit("base 2");
      git("push", "-q", "origin", "main");
      git("checkout", "-q", "-b", "pr2");
      write("pkgs/p/package.json", tool);
      commit("pr2");
      expect(restoreToolConfigFromBase("main")).toEqual(["package.json"]);
      expect(JSON.parse(read("pkgs/p/package.json"))).toEqual({
        name: "tool",
        version: "1",
      });
      expect(JSON.parse(read(".claude-pr/pkgs/p/package.json")).name).toBe(
        "tool",
      );
    });

    test("leaves what the base branch's .claude and .husky hold", () => {
      const base = '{"name":"hooks","bin":"a.js","scripts":{"check":"base"}}';
      write("package.json", '{"name":"x","workspaces":["pkgs/*"]}');
      write(".claude/hooks/package.json", base);
      write(".husky/package.json", base);
      startPr();
      for (const dir of [".claude/hooks", ".husky"]) {
        write(`${dir}/package.json`, '{"bin":"b.js","scripts":{"check":"pr"}}');
      }
      commit("pr");
      restoreConfigFromBase("main");

      expect(restoreToolConfigFromBase("main")).toEqual([]);

      expect(read(".claude/hooks/package.json")).toBe(base);
      expect(read(".husky/package.json")).toBe(base);
    });

    test("counts another spelling of a restored directory only if it is that one", () => {
      const tool = '{"name":"tool","bin":"x.js"}';
      write("package.json", '{"name":"x","workspaces":["*"]}');
      write(".husky/package.json", tool);
      startPr();
      write(".Husky/package.json", tool);
      write("claude.md/package.json", tool);
      commit("pr");
      restoreConfigFromBase("main");
      const ownDirectories = readdirSync(".").filter((name) =>
        [".Husky", "claude.md"].includes(name),
      );

      expect(restoreToolConfigFromBase("main")).toEqual(
        ownDirectories.length > 0 ? ["package.json"] : [],
      );

      expect(read(".husky/package.json")).toBe(tool);
      for (const dir of ownDirectories) {
        expect(JSON.parse(read(`${dir}/package.json`))).toEqual({
          name: "tool",
        });
      }
    });

    test("reports a restored directory's other spelling that it removes", () => {
      write("package.json", '{"name":"x","workspaces":["*"]}');
      startPr();
      write("claude.md/package.json", "{");
      commit("pr");

      expect(restoreToolConfigFromBase("main")).toEqual(["package.json"]);

      expect(existsSync("claude.md")).toBe(false);
    });

    test("takes the commands out of a new package.json", () => {
      startPr();
      write("package.json", '{"name":"x"}');
      commit("pr");
      expect(restoreToolConfigFromBase("main")).toEqual([]);

      write("package.json", '{"name":"x","version":"1","bin":{"t":"a.js"}}');
      commit("pr 2");
      expect(restoreToolConfigFromBase("main")).toEqual(["package.json"]);
      expect(JSON.parse(read("package.json"))).toEqual({
        name: "x",
        version: "1",
      });
    });
  });
});
