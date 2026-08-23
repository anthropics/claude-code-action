import { describe, expect, it } from "bun:test";
import { redactSecrets, sanitizeContent } from "../src/github/utils/sanitizer";

describe("Public Comment Output Sanitization & Redaction", () => {
  it("redacts all credential types from public comment output", () => {
    const rawComment = [
      "Here is the summary of the work done:",
      "- GitHub Token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
      "- Anthropic Key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890",
      "- AWS Access Key: AKIAIOSFODNN7EXAMPLE",
      "- Slack Bot Token: xoxb-1234567890-abcdefghijkl-mnopqrstuvwx",
      "- JWT Bearer: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
      "<!-- Hidden instruction injection -->",
      "Invisible\u200Bzero-width chars",
      "![Image Alt Injection](https://example.com/pic.png)",
    ].join("\n");

    const sanitizedOutput = redactSecrets(sanitizeContent(rawComment));

    // Ensure all secret types are redacted
    expect(sanitizedOutput).not.toContain(
      "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    );
    expect(sanitizedOutput).not.toContain(
      "sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890",
    );
    expect(sanitizedOutput).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(sanitizedOutput).not.toContain(
      "xoxb-1234567890-abcdefghijkl-mnopqrstuvwx",
    );
    expect(sanitizedOutput).not.toContain(
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
    );

    expect(sanitizedOutput).toContain("[REDACTED_GITHUB_TOKEN]");
    expect(sanitizedOutput).toContain("[REDACTED_ANTHROPIC_KEY]");
    expect(sanitizedOutput).toContain("[REDACTED_AWS_KEY_ID]");
    expect(sanitizedOutput).toContain("[REDACTED_SLACK_TOKEN]");
    expect(sanitizedOutput).toContain("[REDACTED_JWT]");

    // Ensure prompt injection / invisible chars / hidden tags are also sanitized
    expect(sanitizedOutput).not.toContain(
      "<!-- Hidden instruction injection -->",
    );
    expect(sanitizedOutput).not.toContain("\u200B");
    expect(sanitizedOutput).not.toContain("Image Alt Injection");
    expect(sanitizedOutput).toContain("![](https://example.com/pic.png)");
  });

  it("ensures public comments have the same secret redaction coverage as logs/errors", () => {
    const errorDetails =
      "Error: failed to connect with sk-ant-abcdefghijklmnopqrstuvwxyz123456 and AKIAIOSFODNN7EXAMPLE";
    const commentBody =
      "Report: encountered sk-ant-abcdefghijklmnopqrstuvwxyz123456 and AKIAIOSFODNN7EXAMPLE";

    const redactedError = redactSecrets(errorDetails);
    const redactedComment = redactSecrets(sanitizeContent(commentBody));

    expect(redactedError).toContain("[REDACTED_ANTHROPIC_KEY]");
    expect(redactedError).toContain("[REDACTED_AWS_KEY_ID]");
    expect(redactedComment).toContain("[REDACTED_ANTHROPIC_KEY]");
    expect(redactedComment).toContain("[REDACTED_AWS_KEY_ID]");
  });
});
