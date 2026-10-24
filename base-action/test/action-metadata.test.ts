import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("base action metadata", () => {
  test("should pass ANTHROPIC_BEDROCK_BASE_URL through without a runtime-host default", () => {
    const metadata = readFileSync(
      new URL("../action.yml", import.meta.url),
      "utf8",
    );

    // A bedrock-runtime default also becomes the endpoint of Claude Code's
    // Bedrock control-plane client, which breaks inference profile lookups.
    const mappings = metadata.match(/^\s+ANTHROPIC_BEDROCK_BASE_URL:.*$/gm);
    expect(mappings).toEqual([
      "        ANTHROPIC_BEDROCK_BASE_URL: ${{ env.ANTHROPIC_BEDROCK_BASE_URL }}",
    ]);
    expect(metadata).toMatch(/^\s+AWS_REGION: \$\{\{ env\.AWS_REGION \}\}$/m);
  });
});
