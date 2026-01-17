import { describe, expect, test } from "bun:test";
import {
  parseActorFilter,
  actorMatchesPattern,
  shouldIncludeCommentByActor,
} from "../src/github/utils/actor-filter";

describe("parseActorFilter", () => {
  test("parses comma-separated actors", () => {
    expect(parseActorFilter("user1,user2,bot[bot]")).toEqual([
      "user1",
      "user2",
      "bot[bot]",
    ]);
  });

  test("handles empty string", () => {
    expect(parseActorFilter("")).toEqual([]);
  });

  test("handles whitespace-only string", () => {
    expect(parseActorFilter("   ")).toEqual([]);
  });

  test("trims whitespace", () => {
    expect(parseActorFilter(" user1 , user2 ")).toEqual(["user1", "user2"]);
  });

  test("filters out empty entries", () => {
    expect(parseActorFilter("user1,,user2")).toEqual(["user1", "user2"]);
  });

  test("handles single actor", () => {
    expect(parseActorFilter("user1")).toEqual(["user1"]);
  });

  test("handles wildcard bot pattern", () => {
    expect(parseActorFilter("*[bot]")).toEqual(["*[bot]"]);
  });
});

describe("actorMatchesPattern", () => {
  test("matches exact username", () => {
    expect(actorMatchesPattern("john-doe", "john-doe")).toBe(true);
  });

  test("does not match different username", () => {
    expect(actorMatchesPattern("john-doe", "jane-doe")).toBe(false);
  });

  test("matches wildcard bot pattern", () => {
    expect(actorMatchesPattern("dependabot[bot]", "*[bot]")).toBe(true);
    expect(actorMatchesPattern("renovate[bot]", "*[bot]")).toBe(true);
    expect(actorMatchesPattern("github-actions[bot]", "*[bot]")).toBe(true);
  });

  test("does not match non-bot with wildcard", () => {
    expect(actorMatchesPattern("john-doe", "*[bot]")).toBe(false);
    expect(actorMatchesPattern("user-bot", "*[bot]")).toBe(false);
  });

  test("matches specific bot", () => {
    expect(actorMatchesPattern("dependabot[bot]", "dependabot[bot]")).toBe(
      true,
    );
    expect(actorMatchesPattern("renovate[bot]", "renovate[bot]")).toBe(true);
  });

  test("does not match different specific bot", () => {
    expect(actorMatchesPattern("dependabot[bot]", "renovate[bot]")).toBe(false);
  });

  test("is case sensitive", () => {
    expect(actorMatchesPattern("User1", "user1")).toBe(false);
    expect(actorMatchesPattern("user1", "User1")).toBe(false);
  });
});

describe("shouldIncludeCommentByActor", () => {
  test("includes all when no filters", () => {
    expect(shouldIncludeCommentByActor("user1", [], [])).toBe(true);
    expect(shouldIncludeCommentByActor("bot[bot]", [], [])).toBe(true);
  });

  test("excludes when in exclude list", () => {
    expect(shouldIncludeCommentByActor("bot[bot]", [], ["*[bot]"])).toBe(false);
    expect(shouldIncludeCommentByActor("user1", [], ["user1"])).toBe(false);
  });

  test("includes when not in exclude list", () => {
    expect(shouldIncludeCommentByActor("user1", [], ["user2"])).toBe(true);
    expect(shouldIncludeCommentByActor("user1", [], ["*[bot]"])).toBe(true);
  });

  test("includes when in include list", () => {
    expect(shouldIncludeCommentByActor("user1", ["user1", "user2"], [])).toBe(
      true,
    );
    expect(shouldIncludeCommentByActor("user2", ["user1", "user2"], [])).toBe(
      true,
    );
  });

  test("excludes when not in include list", () => {
    expect(shouldIncludeCommentByActor("user3", ["user1", "user2"], [])).toBe(
      false,
    );
  });

  test("exclusion takes priority over inclusion", () => {
    expect(shouldIncludeCommentByActor("user1", ["user1"], ["user1"])).toBe(
      false,
    );
    expect(
      shouldIncludeCommentByActor("bot[bot]", ["*[bot]"], ["*[bot]"]),
    ).toBe(false);
  });

  test("handles wildcard in include list", () => {
    expect(shouldIncludeCommentByActor("dependabot[bot]", ["*[bot]"], [])).toBe(
      true,
    );
    expect(shouldIncludeCommentByActor("renovate[bot]", ["*[bot]"], [])).toBe(
      true,
    );
    expect(shouldIncludeCommentByActor("user1", ["*[bot]"], [])).toBe(false);
  });

  test("handles wildcard in exclude list", () => {
    expect(shouldIncludeCommentByActor("dependabot[bot]", [], ["*[bot]"])).toBe(
      false,
    );
    expect(shouldIncludeCommentByActor("renovate[bot]", [], ["*[bot]"])).toBe(
      false,
    );
    expect(shouldIncludeCommentByActor("user1", [], ["*[bot]"])).toBe(true);
  });

  test("handles mixed include and exclude lists", () => {
    // Include user1 and user2, but exclude user2
    expect(
      shouldIncludeCommentByActor("user1", ["user1", "user2"], ["user2"]),
    ).toBe(true);
    expect(
      shouldIncludeCommentByActor("user2", ["user1", "user2"], ["user2"]),
    ).toBe(false);
    expect(
      shouldIncludeCommentByActor("user3", ["user1", "user2"], ["user2"]),
    ).toBe(false);
  });

  test("handles complex bot filtering", () => {
    // Include all bots but exclude dependabot
    expect(
      shouldIncludeCommentByActor(
        "renovate[bot]",
        ["*[bot]"],
        ["dependabot[bot]"],
      ),
    ).toBe(true);
    expect(
      shouldIncludeCommentByActor(
        "dependabot[bot]",
        ["*[bot]"],
        ["dependabot[bot]"],
      ),
    ).toBe(false);
    expect(
      shouldIncludeCommentByActor("user1", ["*[bot]"], ["dependabot[bot]"]),
    ).toBe(false);
  });
});
