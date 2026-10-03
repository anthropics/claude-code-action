import { expect, test } from "bun:test";
import {
  normalizeHtmlEntities,
  sanitizeContent,
} from "../src/github/utils/sanitizer";

test("decodes printable Unicode numeric entities", () => {
  expect(normalizeHtmlEntities("caf&#233; &#8212; &#20320;")).toBe("café — 你");
  expect(normalizeHtmlEntities("&#xE9;&#x2019;&#x1F600;")).toBe("é’😀");
});

test("decodes non-ASCII space and preserves entity order", () => {
  expect(normalizeHtmlEntities("&#233;&#160;&#x2019;&#x1F600;")).toBe(
    "é\u00A0’😀",
  );
});

test("decodes hexadecimal entities that precede decimal ones", () => {
  expect(normalizeHtmlEntities("&#x1F600;&#233;")).toBe("😀é");
  expect(normalizeHtmlEntities("&#x4F60;&#8212;&#x1F600;&#233;")).toBe(
    "你—😀é",
  );
});

test("decodes entities written with leading zeros", () => {
  expect(normalizeHtmlEntities("&#0000233;&#x0000E9;")).toBe("éé");
});

test("decodes the first astral code point", () => {
  expect(normalizeHtmlEntities("&#65536;&#x10000;")).toBe("\u{10000}\u{10000}");
});

test("decodes Unicode space separators", () => {
  expect(normalizeHtmlEntities("a&#8199;b&#8239;c&#12288;d")).toBe(
    "a\u2007b\u202Fc\u3000d",
  );
});

test("decodes a combining mark entity", () => {
  expect(normalizeHtmlEntities("e&#769;")).toBe("e\u0301");
});

// The decimal pass runs before the hexadecimal one, so a decimal `&#38;`
// yields an `&` that the hexadecimal pass then decodes.
test("decodes a hexadecimal entity produced by the decimal pass", () => {
  expect(normalizeHtmlEntities("a&#38;#x1F600;b")).toBe("a😀b");
});

test("sanitizes entity-encoded Unicode the same as the literal characters", () => {
  expect(sanitizeContent("caf&#233; &#20320; &#x1F600;")).toBe(
    sanitizeContent("café 你 😀"),
  );
  expect(sanitizeContent("caf&#233; &#20320; &#x1F600;")).toBe("café 你 😀");
});

test("(control) rejects category-C and invalid decimal entities", () => {
  expect(
    normalizeHtmlEntities(
      "&#0;&#31;&#127;&#8203;&#173;&#8238;&#55296;&#57344;&#1114111;&#1114112;",
    ),
  ).toBe("");
});

test("(control) rejects category-C and invalid hexadecimal entities", () => {
  expect(
    normalizeHtmlEntities(
      "&#x0;&#x1F;&#x7F;&#x200B;&#xD800;&#xE000;&#x110000;",
    ),
  ).toBe("");
});

// U+2028 and U+2029 are separators (Zl, Zp), not category C: an invisible line
// break must not come back through an entity.
test("(control) rejects line and paragraph separator entities", () => {
  expect(normalizeHtmlEntities("a&#8232;b&#8233;c")).toBe("abc");
  expect(normalizeHtmlEntities("a&#x2028;b&#x2029;c")).toBe("abc");
});

test("(control) an entity-encoded surrogate pair does not reassemble", () => {
  expect(normalizeHtmlEntities("a&#xD83D;&#xDE00;b")).toBe("ab");
  expect(normalizeHtmlEntities("a&#55357;&#56832;b")).toBe("ab");
});

// stripInvisibleCharacters runs before normalizeHtmlEntities, so entity-encoded
// invisibles reach the decoder still encoded and only it can drop them.
test("(control) no entity form of an invisible survives sanitizeContent", () => {
  expect(sanitizeContent("a&#8203;b")).toBe("ab");
  expect(sanitizeContent("a&#8232;b")).toBe("ab");
  expect(sanitizeContent("a&#38;#x2028;b")).toBe("ab");
});
