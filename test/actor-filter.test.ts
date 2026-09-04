import { describe, expect, test } from "bun:test";
import {
  isAllowedBot,
  parseActorFilter,
  actorMatchesPattern,
  resolveActorName,
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

describe("resolveActorName", () => {
  test("appends the [bot] suffix to GraphQL App actors", () => {
    // GraphQL returns the bare login for bots; REST would say "dependabot[bot]".
    expect(resolveActorName({ __typename: "Bot", login: "dependabot" })).toBe(
      "dependabot[bot]",
    );
  });

  test("leaves human logins untouched", () => {
    expect(resolveActorName({ __typename: "User", login: "octocat" })).toBe(
      "octocat",
    );
  });

  test("does not double-suffix a login that already ends with [bot]", () => {
    expect(
      resolveActorName({ __typename: "Bot", login: "dependabot[bot]" }),
    ).toBe("dependabot[bot]");
  });

  test("maps deleted accounts to ghost", () => {
    expect(resolveActorName(null)).toBe("ghost");
    expect(resolveActorName(undefined)).toBe("ghost");
  });

  test("falls back to the login when __typename is absent", () => {
    expect(resolveActorName({ login: "octocat" })).toBe("octocat");
  });

  test("a bot actor matches the *[bot] wildcard once resolved", () => {
    const actor = resolveActorName({ __typename: "Bot", login: "renovate" });

    expect(actorMatchesPattern(actor, "*[bot]")).toBe(true);
    // The raw GraphQL login never matches, which is the bug being fixed.
    expect(actorMatchesPattern("renovate", "*[bot]")).toBe(false);
  });

  test("a bot actor matches an exact [bot] pattern once resolved", () => {
    const actor = resolveActorName({ __typename: "Bot", login: "dependabot" });

    expect(shouldIncludeCommentByActor(actor, [], ["dependabot[bot]"])).toBe(
      false,
    );
  });
});

describe("isAllowedBot", () => {
  test("allows every bot when set to *", () => {
    expect(isAllowedBot("dependabot[bot]", "*")).toBe(true);
    expect(isAllowedBot("anything", "  *  ")).toBe(true);
  });

  test("allows nothing when empty", () => {
    expect(isAllowedBot("dependabot[bot]", "")).toBe(false);
    expect(isAllowedBot("dependabot[bot]", "   ")).toBe(false);
  });

  test("matches with or without the [bot] suffix on either side", () => {
    expect(isAllowedBot("dependabot[bot]", "dependabot")).toBe(true);
    expect(isAllowedBot("dependabot", "dependabot[bot]")).toBe(true);
    expect(isAllowedBot("dependabot[bot]", "dependabot[bot]")).toBe(true);
    expect(isAllowedBot("dependabot", "dependabot")).toBe(true);
  });

  test("matches case-insensitively", () => {
    expect(isAllowedBot("Copilot", "copilot")).toBe(true);
    expect(isAllowedBot("copilot", "COPILOT[BOT]")).toBe(true);
  });

  test("handles whitespace and empty entries in the list", () => {
    expect(isAllowedBot("renovate[bot]", " dependabot , renovate ,, ")).toBe(
      true,
    );
  });

  test("rejects an actor that is not listed", () => {
    expect(isAllowedBot("renovate[bot]", "dependabot,copilot")).toBe(false);
  });

  test("does not treat * as a wildcard inside a list", () => {
    // "*" allows all bots only as the entire value; "*[bot]" is an exact entry
    // here, unlike actorMatchesPattern which does support it as a wildcard.
    expect(isAllowedBot("dependabot[bot]", "*[bot]")).toBe(false);
  });
});
