import type { GitHubIssue } from "../types";

export interface PRContent {
  title: string;
  body: string;
}

function generatePRTitle(issueTitle: string): string {
  // Remove common issue prefixes/patterns and create a more action-oriented title
  let title = issueTitle.trim();

  // Determine action prefix based on original issue content patterns (before removing prefixes)
  const lowerOriginal = issueTitle.toLowerCase();
  let prefix = "Fix";

  if (
    lowerOriginal.includes("add") ||
    lowerOriginal.includes("implement") ||
    lowerOriginal.includes("create")
  ) {
    prefix = "Add";
  } else if (
    lowerOriginal.includes("update") ||
    lowerOriginal.includes("improve") ||
    lowerOriginal.includes("enhance")
  ) {
    prefix = "Update";
  } else if (
    lowerOriginal.includes("remove") ||
    lowerOriginal.includes("delete")
  ) {
    prefix = "Remove";
  } else if (
    lowerOriginal.includes("refactor") ||
    lowerOriginal.includes("restructure")
  ) {
    prefix = "Refactor";
  }

  // Remove common issue indicators
  title = title
    .replace(/^(bug|issue|problem|error|fix)\s*:?\s*/i, "")
    .replace(/^(feature|feat|add|implement)\s*:?\s*/i, "")
    .replace(/^(enhancement|improve|update)\s*:?\s*/i, "");

  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);

  // Calculate max length for title content (60 - prefix length - ": " - "...")
  const maxTitleLength = 60 - prefix.length - 2; // "Fix: "
  if (title.length > maxTitleLength - 3) {
    // Reserve 3 chars for "..."
    title = title.substring(0, maxTitleLength - 3) + "...";
  }

  return `${prefix}: ${title}`;
}

function generatePRBody(issueData: GitHubIssue, issueNumber: string): string {
  const { title, body } = issueData;

  // Create a structured PR body
  let prBody = `## Summary

This PR addresses the issue: "${title}"

## Changes

`;

  // Add issue body if it exists and provides useful context
  if (body && body.trim() && body.trim() !== title) {
    // Clean up the issue body for PR context
    const cleanBody = body
      .replace(/<!--[\s\S]*?-->/g, "") // Remove HTML comments
      .replace(/^\s*#{1,6}\s*/gm, "### ") // Normalize headers
      .trim();

    if (cleanBody.length > 0) {
      prBody += `${cleanBody}

## Related Issue

`;
    }
  }

  prBody += `Fixes #${issueNumber}

---

*This PR was automatically created by Claude Code Action.*`;

  return prBody;
}

export function generatePRContent(
  issueData: GitHubIssue,
  issueNumber: string,
): PRContent {
  return {
    title: generatePRTitle(issueData.title),
    body: generatePRBody(issueData, issueNumber),
  };
}
