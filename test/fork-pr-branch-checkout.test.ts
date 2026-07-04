import { describe, expect, it } from "bun:test";
import {
  forkPullRequestCheckoutArgs,
  forkPullRequestFetchArgs,
  forkPullRequestHeadRef,
} from "../src/github/operations/branch";

describe("fork PR branch checkout helpers", () => {
  it("uses a namespaced remote ref that cannot collide with checked-out branches", () => {
    expect(forkPullRequestHeadRef(38)).toBe("refs/remotes/pull/38/head");
  });

  it("force-fetches the pull head into the namespaced remote ref", () => {
    expect(forkPullRequestFetchArgs(38, 20)).toEqual([
      "fetch",
      "origin",
      "--depth=20",
      "+pull/38/head:refs/remotes/pull/38/head",
    ]);
  });

  it("checks out detached when the fork head collides with the current branch", () => {
    expect(forkPullRequestCheckoutArgs(38, "main", "main")).toEqual([
      "checkout",
      "--detach",
      "refs/remotes/pull/38/head",
      "--",
    ]);
  });

  it("creates a local branch when the fork head name is safe to use", () => {
    expect(forkPullRequestCheckoutArgs(38, "feature-x", "main")).toEqual([
      "checkout",
      "-B",
      "feature-x",
      "refs/remotes/pull/38/head",
      "--",
    ]);
  });
});
