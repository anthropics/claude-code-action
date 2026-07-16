import { describe, expect, test } from "bun:test";
import {
  parseActorFilter,
  actorMatchesPattern,
  shouldIncludeCommentByActor,
  normalizeActorLogin,
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

describe("normalizeActorLogin", () => {
  test("appends [bot] for GraphQL Bot authors without suffix", () => {
    expect(normalizeActorLogin("github-actions", "Bot")).toBe(
      "github-actions[bot]",
    );
    expect(normalizeActorLogin("claude", "Bot")).toBe("claude[bot]");
    expect(normalizeActorLogin("dependabot", "Bot")).toBe("dependabot[bot]");
  });

  test("does not double-append [bot] when already present", () => {
    expect(normalizeActorLogin("github-actions[bot]", "Bot")).toBe(
      "github-actions[bot]",
    );
  });

  test("leaves User and other typenames unchanged", () => {
    expect(normalizeActorLogin("john-doe", "User")).toBe("john-doe");
    expect(normalizeActorLogin("acme", "Organization")).toBe("acme");
    expect(normalizeActorLogin("user-bot", "User")).toBe("user-bot");
  });

  test("leaves login unchanged when typename is missing", () => {
    expect(normalizeActorLogin("github-actions[bot]")).toBe(
      "github-actions[bot]",
    );
    expect(normalizeActorLogin("github-actions", null)).toBe("github-actions");
    expect(normalizeActorLogin("github-actions", undefined)).toBe(
      "github-actions",
    );
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

  test("matches GraphQL-shaped bot logins after normalization", () => {
    // GraphQL returns login without [bot] + __typename Bot
    expect(
      actorMatchesPattern(
        normalizeActorLogin("github-actions", "Bot"),
        "*[bot]",
      ),
    ).toBe(true);
    expect(
      actorMatchesPattern(normalizeActorLogin("claude", "Bot"), "*[bot]"),
    ).toBe(true);
    expect(
      actorMatchesPattern(
        normalizeActorLogin("dependabot", "Bot"),
        "dependabot[bot]",
      ),
    ).toBe(true);
  });

  test("does not match GraphQL User login as bot even if name contains bot", () => {
    expect(
      actorMatchesPattern(normalizeActorLogin("user-bot", "User"), "*[bot]"),
    ).toBe(false);
  });

  test("raw GraphQL bot login without normalization does not match *[bot]", () => {
    // Documents the pre-fix bug: bare GraphQL login has no [bot] suffix
    expect(actorMatchesPattern("github-actions", "*[bot]")).toBe(false);
    expect(actorMatchesPattern("claude", "*[bot]")).toBe(false);
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

  test("excludes GraphQL-shaped bots when *[bot] is in exclude list", () => {
    const graphqlBots = [
      normalizeActorLogin("github-actions", "Bot"),
      normalizeActorLogin("claude", "Bot"),
      normalizeActorLogin("dependabot", "Bot"),
    ];
    for (const actor of graphqlBots) {
      expect(shouldIncludeCommentByActor(actor, [], ["*[bot]"])).toBe(false);
    }
    expect(
      shouldIncludeCommentByActor(
        normalizeActorLogin("human-user", "User"),
        [],
        ["*[bot]"],
      ),
    ).toBe(true);
  });
});
