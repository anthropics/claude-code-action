import { describe, expect, test } from "bun:test";
import { YAML } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

// The job starts, and the runner receives the secrets, before the action can
// check write access, so the templates must keep untrusted authors from
// starting the job at all.
const templates = ["examples/claude.yml", "examples/claude-wif.yml"];
const associations: Record<string, string> = {
  issue_comment: "github.event.comment.author_association",
  pull_request_review_comment: "github.event.comment.author_association",
  pull_request_review: "github.event.review.author_association",
  issues: "github.event.issue.author_association",
};

describe("example workflow trust gate", () => {
  for (const file of templates) {
    test(`${file} gates every trigger on author_association`, () => {
      const workflow = YAML.parse(readFileSync(join(root, file), "utf8")) as {
        jobs: Record<string, { if?: string }>;
      };
      const condition = Object.values(workflow.jobs)[0]!.if!;
      const clauses = condition
        .split(/\|\|\s*\n/)
        .map((clause) => clause.replace(/\s+/g, " ").trim());
      expect(clauses).toHaveLength(Object.keys(associations).length);
      for (const [event, field] of Object.entries(associations)) {
        const clause = clauses.find((c) => c.includes(`'${event}'`))!;
        expect(clause).toContain(
          `contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), ${field})`,
        );
      }
    });
  }
});
