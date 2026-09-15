import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

/**
 * The shipped mention-triggered workflows must gate on author_association.
 *
 * Without it, anyone who can comment can start a run: the job takes a runner
 * and spends tokens before checkWritePermissions rejects the actor, which on a
 * public repository is a billing exposure. See issue #1481.
 */

const INSIDERS = `contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]')`;

// Workflows that respond to an @claude mention, and the association field each
// mention-bearing event carries its trigger on.
const MENTION_WORKFLOWS = [
  "../examples/claude.yml",
  "../examples/claude-wif.yml",
  "../.github/workflows/claude.yml",
];

function condition(path: string): string {
  const raw = readFileSync(new URL(path, import.meta.url), "utf8");
  // Grab the block-scalar `if:` body: subsequent lines indented deeper than
  // the key, stopping at the next sibling key (e.g. `runs-on:`).
  const match = raw.match(/^ {4}if: \|\n((?: {6}.*\n)+)/m);
  if (!match?.[1]) throw new Error(`no block-scalar if: found in ${path}`);
  return match[1];
}

/**
 * Split the condition into its top-level `||` branches.
 *
 * Splitting on the literal "||" is wrong: the issues.opened branch contains a
 * nested `(body || title)`, so a naive split fragments it. Track paren depth
 * and only break on a `||` at depth zero.
 */
function topLevelBranches(cond: string): string[] {
  const branches: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < cond.length; i++) {
    const ch = cond[i]!;
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth === 0 && ch === "|" && cond[i + 1] === "|") {
      branches.push(current);
      current = "";
      i++; // skip the second '|'
      continue;
    }
    current += ch;
  }
  if (current.trim()) branches.push(current);
  return branches.map((b) => b.trim()).filter((b) => b.length > 0);
}

describe("mention-triggered workflows gate on author_association", () => {
  for (const path of MENTION_WORKFLOWS) {
    describe(path, () => {
      test("guards every branch that reads a mention body", () => {
        const cond = condition(path);
        const mentionBranches = topLevelBranches(cond).filter((branch) =>
          branch.includes("@claude"),
        );

        expect(mentionBranches.length).toBeGreaterThan(0);
        for (const branch of mentionBranches) {
          expect(branch).toInclude(INSIDERS);
        }
      });

      test("reads the association off the field the event actually carries", () => {
        const cond = condition(path);
        // A branch keyed to an event must not assert on another event's payload
        // field, e.g. pull_request_review carries review.author_association.
        for (const branch of topLevelBranches(cond)) {
          if (branch.includes("'pull_request_review'")) {
            expect(branch).toInclude("github.event.review.author_association");
          } else if (branch.includes("'issue_comment'")) {
            expect(branch).toInclude("github.event.comment.author_association");
          } else if (branch.includes("'pull_request_review_comment'")) {
            expect(branch).toInclude("github.event.comment.author_association");
          }
        }
      });

      test("does not rely on a single leading guard, which && would bind to only the first branch", () => {
        const cond = condition(path);
        // `&&` binds tighter than `||` in GitHub Actions expressions, so the
        // guard has to appear in each mention branch rather than once up front.
        const guardCount = cond.split(INSIDERS).length - 1;
        const mentionBranchCount = topLevelBranches(cond).filter((b) =>
          b.includes("@claude"),
        ).length;
        expect(guardCount).toBe(mentionBranchCount);
      });

      test("does not ship an unconditional assigned/labeled branch", () => {
        const cond = condition(path);
        // assignee_trigger / label_trigger are unset by default, so
        // checkContainsTrigger cannot match on those events. An unguarded
        // `action == 'assigned'` branch would start a runner for every
        // assignment only to no-op — widening runner usage, which is the
        // opposite of the point. Enabling them is documented instead.
        for (const branch of topLevelBranches(cond)) {
          const isAssignOrLabel =
            branch.includes("'assigned'") || branch.includes("'labeled'");
          if (!isAssignOrLabel) continue;
          // If such a branch is ever added it must be qualified by the
          // configured trigger, not left as a bare event/action match.
          expect(branch).toMatch(/assignee\.login|label\.name/);
        }
      });

      test("does not subscribe to issue actions it cannot act on", () => {
        const raw = readFileSync(new URL(path, import.meta.url), "utf8");
        const issuesTypes = raw.match(/^ {2}issues:\n {4}types: \[(.*)\]$/m);
        expect(issuesTypes).not.toBeNull();
        const types = issuesTypes![1]!.split(",").map((t) => t.trim());
        const cond = condition(path);
        // Every subscribed action needs a branch that can match it, otherwise
        // the workflow wakes a runner for events it will always skip.
        for (const type of types) {
          expect(cond).toInclude(`'${type}'`);
        }
      });
    });
  }
});
