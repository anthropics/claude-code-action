import { expect, test } from "bun:test";
import { parseMaxDurationMs } from "../src/entrypoints/run";

test("an unset or blank session duration leaves the limit disabled", () => {
  expect(parseMaxDurationMs(undefined)).toBeUndefined();
  expect(parseMaxDurationMs("   ")).toBeUndefined();
});

test("converts whole minutes to milliseconds", () => {
  expect(parseMaxDurationMs(" 5 ")).toBe(300_000);
});

test.each(["0", "-1", "1.5", "1e2", "invalid", "35792"])(
  "rejects invalid session duration %s",
  (input) => {
    expect(() => parseMaxDurationMs(input)).toThrow("max_duration_minutes");
  },
);
