#!/usr/bin/env bun

import { describe, test, expect } from "bun:test";
import { parsePlugins } from "../src/install-plugins";

describe("parsePlugins", () => {
  test("should return empty array for undefined input", () => {
    expect(parsePlugins(undefined)).toEqual([]);
  });

  test("should return empty array for empty string", () => {
    expect(parsePlugins("")).toEqual([]);
  });

  test("should return empty array for whitespace-only string", () => {
    expect(parsePlugins("   \n\t  ")).toEqual([]);
  });

  test("should parse single plugin", () => {
    expect(parsePlugins("feature-dev")).toEqual(["feature-dev"]);
  });

  test("should parse multiple plugins", () => {
    expect(parsePlugins("feature-dev,test-coverage-reviewer")).toEqual([
      "feature-dev",
      "test-coverage-reviewer",
    ]);
  });

  test("should trim whitespace around plugin names", () => {
    expect(parsePlugins("  feature-dev  ,  test-coverage-reviewer  ")).toEqual([
      "feature-dev",
      "test-coverage-reviewer",
    ]);
  });

  test("should handle spaces between commas", () => {
    expect(
      parsePlugins(
        "feature-dev, test-coverage-reviewer, code-quality-reviewer",
      ),
    ).toEqual([
      "feature-dev",
      "test-coverage-reviewer",
      "code-quality-reviewer",
    ]);
  });

  test("should filter out empty values from consecutive commas", () => {
    expect(parsePlugins("feature-dev,,test-coverage-reviewer")).toEqual([
      "feature-dev",
      "test-coverage-reviewer",
    ]);
  });

  test("should handle trailing comma", () => {
    expect(parsePlugins("feature-dev,test-coverage-reviewer,")).toEqual([
      "feature-dev",
      "test-coverage-reviewer",
    ]);
  });

  test("should handle leading comma", () => {
    expect(parsePlugins(",feature-dev,test-coverage-reviewer")).toEqual([
      "feature-dev",
      "test-coverage-reviewer",
    ]);
  });

  test("should handle plugins with special characters", () => {
    expect(parsePlugins("@scope/plugin-name,plugin-name-2")).toEqual([
      "@scope/plugin-name",
      "plugin-name-2",
    ]);
  });

  test("should handle complex whitespace patterns", () => {
    expect(
      parsePlugins(
        "\n  feature-dev  \n,\t  test-coverage-reviewer\t,  code-quality  \n",
      ),
    ).toEqual(["feature-dev", "test-coverage-reviewer", "code-quality"]);
  });
});
