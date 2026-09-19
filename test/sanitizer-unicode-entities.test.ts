import { expect, test } from "bun:test";
import { normalizeHtmlEntities } from "../src/github/utils/sanitizer";

test("decodes printable Unicode numeric entities", () => {
  expect(normalizeHtmlEntities("caf&#233; &#8212; &#20320;")).toBe("café — 你");
  expect(normalizeHtmlEntities("&#xE9;&#x2019;&#x1F600;")).toBe("é’😀");
});
