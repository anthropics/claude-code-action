import { describe, expect, it } from "bun:test";
import { diffLineSchema } from "../src/mcp/inline-comment-schema";

describe("diffLineSchema", () => {
  it("accepts positive integers and rejects invalid diff line numbers", () => {
    expect(diffLineSchema.safeParse(1).success).toBe(true);
    expect(diffLineSchema.safeParse(undefined).success).toBe(true);
    expect(diffLineSchema.safeParse(0).success).toBe(false);
    expect(diffLineSchema.safeParse(-1).success).toBe(false);
    expect(diffLineSchema.safeParse(3.5).success).toBe(false);
  });
});
