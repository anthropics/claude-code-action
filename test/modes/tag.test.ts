import { describe, test, expect } from "bun:test";
import { prepareTagMode } from "../../src/modes/tag";

describe("Tag Mode", () => {
  test("prepareTagMode is exported as a function", () => {
    expect(typeof prepareTagMode).toBe("function");
  });
});
