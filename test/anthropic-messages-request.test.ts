import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  messagesUrl,
  parseCustomHeaders,
} from "../src/utils/anthropic-messages-request";

describe("messagesUrl", () => {
  test("uses the Anthropic API when no base URL is set", () => {
    expect(messagesUrl(undefined)).toBe(
      "https://api.anthropic.com/v1/messages",
    );
    expect(messagesUrl("")).toBe("https://api.anthropic.com/v1/messages");
    expect(messagesUrl("   ")).toBe("https://api.anthropic.com/v1/messages");
  });

  test("uses ANTHROPIC_BASE_URL when it is set", () => {
    expect(messagesUrl("https://gateway.example.com/anthropic")).toBe(
      "https://gateway.example.com/anthropic/v1/messages",
    );
  });

  test("removes trailing slashes from the base URL", () => {
    expect(messagesUrl(" https://gateway.example.com/anthropic// ")).toBe(
      "https://gateway.example.com/anthropic/v1/messages",
    );
  });
});

describe("parseCustomHeaders", () => {
  test("returns no headers when the value is empty", () => {
    expect(parseCustomHeaders(undefined)).toEqual({});
    expect(parseCustomHeaders("")).toEqual({});
  });

  test("parses one Name: Value pair per line", () => {
    expect(
      parseCustomHeaders(
        "x-team: platform\r\nx-route: a: b\n\nno-colon-line\n: no-name",
      ),
    ).toEqual({ "x-team": "platform", "x-route": "a: b" });
  });
});

describe("post buffered inline comments step", () => {
  test("gets the same gateway settings as the main run step", () => {
    const metadata = readFileSync(
      new URL("../action.yml", import.meta.url),
      "utf8",
    );
    const step = metadata.slice(
      metadata.indexOf("- name: Post buffered inline comments"),
      metadata.indexOf("post-buffered-inline-comments.ts"),
    );

    expect(step).toContain("ANTHROPIC_BASE_URL: ${{ env.ANTHROPIC_BASE_URL }}");
    expect(step).toContain(
      "ANTHROPIC_CUSTOM_HEADERS: ${{ env.ANTHROPIC_CUSTOM_HEADERS }}",
    );
  });
});
