import { describe, expect, it } from "bun:test";
import { formatBody, formatComments } from "../src/github/data/formatter";
import type { GitHubComment } from "../src/github/types";

describe("Sanitization Integration", () => {
  it("should sanitize complete issue/PR body with various hidden content patterns", () => {
    const issueBody = `
# Feature Request: Add user dashboard

## Description
We need a new dashboard for users to track their activity.

<!-- HTML comment that should be removed -->

## Technical Details
The dashboard should display:
- User statistics ![dashboard mockup with hidden​‌‍text](dashboard.png)
- Activity graphs <img alt="example graph description" src="graph.jpg">
- Recent actions

## Implementation Notes
See [documentation](https://docs.example.com "internal docs title") for API details.

<div data-instruction="example instruction" aria-label="dashboard label" title="hover text">
  The implementation should follow our standard patterns.
</div>

Additional notes: Text­with­soft­hyphens and &#72;&#105;&#100;&#100;&#101;&#110; encoded content.

<input placeholder="search placeholder" type="text" />

Direction override test: ‮reversed‬ text should be normalized.`;

    const imageUrlMap = new Map<string, string>();
    const result = formatBody(issueBody, imageUrlMap);

    // Verify hidden content is removed
    expect(result).not.toContain("<!-- HTML comment");
    expect(result).not.toContain("hidden​‌‍text");
    expect(result).not.toContain("example graph description");
    expect(result).not.toContain("internal docs title");
    expect(result).not.toContain("example instruction");
    expect(result).not.toContain("dashboard label");
    expect(result).not.toContain("hover text");
    expect(result).not.toContain("search placeholder");
    expect(result).not.toContain("\u200B");
    expect(result).not.toContain("\u200C");
    expect(result).not.toContain("\u200D");
    expect(result).not.toContain("\u00AD");
    expect(result).not.toContain("\u202E");
    expect(result).not.toContain("&#72;");

    // Verify legitimate content is preserved
    expect(result).toContain("# Feature Request: Add user dashboard");
    expect(result).toContain("## Description");
    expect(result).toContain("We need a new dashboard");
    expect(result).toContain("User statistics");
    expect(result).toContain("![](dashboard.png)");
    expect(result).toContain('<img src="graph.jpg">');
    expect(result).toContain("[documentation](https://docs.example.com)");
    expect(result).toContain(
      "The implementation should follow our standard patterns",
    );
    expect(result).toContain("Hidden encoded content");
    expect(result).toContain('<input type="text" />');
  });

  it("should sanitize GitHub comments preserving discussion flow", () => {
    const comments: GitHubComment[] = [
      {
        id: "1",
        databaseId: "100001",
        body: `Great idea! Here are my thoughts:

1. We should consider the performance impact
2. The UI mockup looks good: ![ui design](mockup.png)
3. Check the [API docs](https://api.example.com "api reference") for rate limits

<div aria-label="comment metadata" data-comment-type="review">
  This change would affect multiple systems.
</div>

Note: Implementation​should​follow​best​practices.`,
        author: { login: "reviewer1" },
        createdAt: "2023-01-01T10:00:00Z",
      },
      {
        id: "2",
        databaseId: "100002",
        body: `Thanks for the feedback! 

<!-- Internal note: discussed with team -->

I've updated the proposal based on your suggestions.

&#84;&#101;&#115;&#116; &#110;&#111;&#116;&#101;: All systems checked.

<span title="status update" data-status="approved">Ready for implementation</span>`,
        author: { login: "author1" },
        createdAt: "2023-01-01T12:00:00Z",
      },
    ];

    const result = formatComments(comments);

    // Verify hidden content is removed
    expect(result).not.toContain("<!-- Internal note");
    expect(result).not.toContain("api reference");
    expect(result).not.toContain("comment metadata");
    expect(result).not.toContain('data-comment-type="review"');
    expect(result).not.toContain("status update");
    expect(result).not.toContain('data-status="approved"');
    expect(result).not.toContain("\u200B");
    expect(result).not.toContain("&#84;");

    // Verify discussion flow is preserved
    expect(result).toContain("Great idea! Here are my thoughts:");
    expect(result).toContain("1. We should consider the performance impact");
    expect(result).toContain("2. The UI mockup looks good: ![](mockup.png)");
    expect(result).toContain(
      "3. Check the [API docs](https://api.example.com)",
    );
    expect(result).toContain("This change would affect multiple systems.");
    expect(result).toContain("Implementationshouldfollowbestpractices");
    expect(result).toContain("Thanks for the feedback!");
    expect(result).toContain(
      "I've updated the proposal based on your suggestions.",
    );
    expect(result).toContain("Test note: All systems checked.");
    expect(result).toContain("Ready for implementation");
    expect(result).toContain("[reviewer1 at");
    expect(result).toContain("[author1 at");
  });
});
