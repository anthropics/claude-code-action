import { expect, test } from "bun:test";
import { normalizeHtmlEntities } from "../src/github/utils/sanitizer";

test("decodes printable Unicode numeric entities", () => {
  expect(normalizeHtmlEntities("caf&#233; &#8212; &#20320;")).toBe("café — 你");
  expect(normalizeHtmlEntities("&#xE9;&#x2019;&#x1F600;")).toBe("é’😀");
});

test("decodes non-ASCII space and preserves entity order", () => {
  expect(normalizeHtmlEntities("&#233;&#160;&#x2019;&#x1F600;")).toBe("é ’😀");
});

test("(control) rejects category-C and invalid numeric entities", () => {
  expect(
    normalizeHtmlEntities(
      "&#0;&#31;&#127;&#8203;&#173;&#8238;&#55296;&#57344;&#1114111;&#1114112;",
    ),
  ).toBe("");
});
