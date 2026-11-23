#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { describe, expect, test } from "bun:test";
import { escapeWorkflowCommands } from "../src/log";

describe("escapeWorkflowCommands", () => {
  test.each([
    ["::warning::x", "\\::warning::x"],
    ["a\n::warning::x", "a\n\\::warning::x"],
    ["a\r::warning::x", "a\r\\::warning::x"],
    ["a\r\n \t::warning::x", "a\r\n \t\\::warning::x"],
    [" \u0085 ::warning::x", " \u0085 \\::warning::x"],
    ["::warning file=a::x", "\\::warning file=a::x"],
    ["a ##[warning]x", "a ##[\\warning]x"],
    ["##[##[warning]x", "##[\\##[\\warning]x"],
    ["####[warning]x", "####[\\warning]x"],
  ])("escapes %j", (text, escaped) => {
    expect(escapeWorkflowCommands(text)).toBe(escaped);
  });

  test.each(["std::string::npos", "## [x]", "a: b", "- see ::x", ""])(
    "keeps %j",
    (text) => {
      expect(escapeWorkflowCommands(text)).toBe(text);
    },
  );
});

test("escapeConsoleOutput escapes what console writes, and not @actions/core", () => {
  const { stdout, stderr } = spawnSync(
    "bun",
    [
      "-e",
      `import { escapeConsoleOutput } from "./src/log";
       import * as core from "@actions/core";
       escapeConsoleOutput();
       console.log("a\\n::warning::b", { c: "##[warning]d" }, "100%s");
       console.error("failed:", new Error("\\n::warning::e"));
       try { await Bun.$\`git no-such-command\`.quiet(); } catch (e) { console.error(e); }
       core.warning("f\\n::warning::g");`,
    ],
    { cwd: new URL("..", import.meta.url).pathname, encoding: "utf8" },
  );
  expect(stdout).toContain("a\n\\::warning::b");
  expect(stdout).toContain("##[\\warning]d");
  expect(stdout).toContain("100%s");
  expect(stdout).toContain("\n::warning::f%0A::warning::g\n");
  expect(stderr).toContain("\n\\::warning::e");
  expect(stderr).toContain("no-such-command' is not a git command");
});
