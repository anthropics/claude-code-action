import { expect, test } from "bun:test";
import { normalizeHtmlEntities } from "../src/github/utils/sanitizer";

test("decodes printable Unicode numeric entities", () => {
  expect(normalizeHtmlEntities("caf&#233; &#8212; &#20320;")).toBe("café — 你");
  expect(normalizeHtmlEntities("&#xE9;&#x2019;&#x1F600;")).toBe("é’😀");
});

test("decodes non-ASCII space and preserves entity order", () => {
  expect(normalizeHtmlEntities("&#233;&#160;&#x2019;&#x1F600;")).toBe("é ’😀");
});

test("rejects category-C and invalid decimal entities", () => {
  expect(
    normalizeHtmlEntities(
      "&#0;&#31;&#127;&#8203;&#173;&#8238;&#55296;&#57344;&#1114111;&#1114112;",
    ),
  ).toBe("");
});

test("rejects category-C and invalid hexadecimal entities", () => {
  expect(
    normalizeHtmlEntities(
      "&#x0;&#x1F;&#x7F;&#x200B;&#xD800;&#xE000;&#x110000;",
    ),
  ).toBe("");
});

// U+2028 and U+2029 are separators (Zl, Zp), not category C: an invisible line
// break must not come back through an entity.
test("rejects line and paragraph separator entities", () => {
  expect(normalizeHtmlEntities("a&#8232;b&#8233;c")).toBe("abc");
  expect(normalizeHtmlEntities("a&#x2028;b&#x2029;c")).toBe("abc");
});
