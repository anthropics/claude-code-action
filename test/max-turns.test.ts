#!/usr/bin/env bun

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

describe("max_turns configuration", () => {
  test("action.yml should include max_turns input", () => {
    const actionYmlPath = join(process.cwd(), "action.yml");
    const actionYmlContent = readFileSync(actionYmlPath, "utf-8");
    const actionYml = parse(actionYmlContent);

    // Check that max_turns is defined in inputs
    expect(actionYml.inputs).toHaveProperty("max_turns");
    expect(actionYml.inputs.max_turns).toMatchObject({
      description: expect.stringContaining(
        "Maximum number of conversation turns",
      ),
      required: false,
      default: "",
    });
  });

  test("action.yml should pass max_turns to base action", () => {
    const actionYmlPath = join(process.cwd(), "action.yml");
    const actionYmlContent = readFileSync(actionYmlPath, "utf-8");

    // Find the claude-code step
    const claudeCodeStepMatch = actionYmlContent.match(
      /- name: Run Claude Code[\s\S]*?with:([\s\S]*?)env:/,
    );

    expect(claudeCodeStepMatch).toBeTruthy();

    if (claudeCodeStepMatch) {
      const withSection = claudeCodeStepMatch[1];

      // Check that max_turns is passed to the base action
      expect(withSection).toContain("max_turns: ${{ inputs.max_turns }}");
    }
  });

  test("max_turns should be positioned correctly in inputs order", () => {
    const actionYmlPath = join(process.cwd(), "action.yml");
    const actionYmlContent = readFileSync(actionYmlPath, "utf-8");
    const actionYml = parse(actionYmlContent);

    const inputKeys = Object.keys(actionYml.inputs);
    const maxTurnsIndex = inputKeys.indexOf("max_turns");
    const timeoutIndex = inputKeys.indexOf("timeout_minutes");

    // max_turns should come before timeout_minutes
    expect(maxTurnsIndex).toBeGreaterThan(-1);
    expect(timeoutIndex).toBeGreaterThan(-1);
    expect(maxTurnsIndex).toBeLessThan(timeoutIndex);
  });
});
