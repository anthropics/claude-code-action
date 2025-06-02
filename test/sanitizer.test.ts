import { describe, expect, it } from "bun:test";
import {
  stripInvisibleCharacters,
  stripMarkdownImageAltText,
  stripMarkdownLinkTitles,
  stripHiddenAttributes,
  normalizeHtmlEntities,
  sanitizeContent,
  stripHtmlComments,
} from "../src/github/utils/sanitizer";

describe("stripInvisibleCharacters", () => {
  it("should remove zero-width characters", () => {
    expect(stripInvisibleCharacters("Hello\u200BWorld")).toBe("HelloWorld");
    expect(stripInvisibleCharacters("Text\u200C\u200D")).toBe("Text");
    expect(stripInvisibleCharacters("\uFEFFStart")).toBe("Start");
  });

  it("should remove control characters", () => {
    expect(stripInvisibleCharacters("Hello\u0000World")).toBe("HelloWorld");
    expect(stripInvisibleCharacters("Text\u001F\u007F")).toBe("Text");
  });

  it("should preserve common whitespace", () => {
    expect(stripInvisibleCharacters("Hello\nWorld")).toBe("Hello\nWorld");
    expect(stripInvisibleCharacters("Tab\there")).toBe("Tab\there");
    expect(stripInvisibleCharacters("Carriage\rReturn")).toBe(
      "Carriage\rReturn",
    );
  });

  it("should remove soft hyphens", () => {
    expect(stripInvisibleCharacters("Soft\u00ADHyphen")).toBe("SoftHyphen");
  });

  it("should remove Unicode direction overrides", () => {
    expect(stripInvisibleCharacters("Text\u202A\u202BMore")).toBe("TextMore");
    expect(stripInvisibleCharacters("\u2066Isolated\u2069")).toBe("Isolated");
  });
});

describe("stripMarkdownImageAltText", () => {
  it("should remove alt text from markdown images", () => {
    expect(stripMarkdownImageAltText("![example alt text](image.png)")).toBe(
      "![](image.png)",
    );
    expect(
      stripMarkdownImageAltText("Text ![description](pic.jpg) more text"),
    ).toBe("Text ![](pic.jpg) more text");
  });

  it("should handle multiple images", () => {
    expect(stripMarkdownImageAltText("![one](1.png) ![two](2.png)")).toBe(
      "![](1.png) ![](2.png)",
    );
  });

  it("should handle empty alt text", () => {
    expect(stripMarkdownImageAltText("![](image.png)")).toBe("![](image.png)");
  });
});

describe("stripMarkdownLinkTitles", () => {
  it("should remove titles from markdown links", () => {
    expect(stripMarkdownLinkTitles('[Link](url.com "example title")')).toBe(
      "[Link](url.com)",
    );
    expect(stripMarkdownLinkTitles("[Link](url.com 'example title')")).toBe(
      "[Link](url.com)",
    );
  });

  it("should handle multiple links", () => {
    expect(
      stripMarkdownLinkTitles('[One](1.com "first") [Two](2.com "second")'),
    ).toBe("[One](1.com) [Two](2.com)");
  });

  it("should preserve links without titles", () => {
    expect(stripMarkdownLinkTitles("[Link](url.com)")).toBe("[Link](url.com)");
  });
});

describe("stripHiddenAttributes", () => {
  it("should remove alt attributes", () => {
    expect(
      stripHiddenAttributes('<img alt="example text" src="pic.jpg">'),
    ).toBe('<img src="pic.jpg">');
    expect(stripHiddenAttributes("<img alt='example' src=\"pic.jpg\">")).toBe(
      '<img src="pic.jpg">',
    );
    expect(stripHiddenAttributes('<img alt=example src="pic.jpg">')).toBe(
      '<img src="pic.jpg">',
    );
  });

  it("should remove title attributes", () => {
    expect(
      stripHiddenAttributes('<a title="example text" href="#">Link</a>'),
    ).toBe('<a href="#">Link</a>');
    expect(stripHiddenAttributes("<div title='example'>Content</div>")).toBe(
      "<div>Content</div>",
    );
  });

  it("should remove aria-label attributes", () => {
    expect(
      stripHiddenAttributes('<button aria-label="example">Click</button>'),
    ).toBe("<button>Click</button>");
  });

  it("should remove data-* attributes", () => {
    expect(
      stripHiddenAttributes(
        '<div data-test="example" data-info="more example">Text</div>',
      ),
    ).toBe("<div>Text</div>");
  });

  it("should remove placeholder attributes", () => {
    expect(
      stripHiddenAttributes('<input placeholder="example text" type="text">'),
    ).toBe('<input type="text">');
  });

  it("should handle multiple attributes", () => {
    expect(
      stripHiddenAttributes(
        '<img alt="example" title="test" src="pic.jpg" class="image">',
      ),
    ).toBe('<img src="pic.jpg" class="image">');
  });
});

describe("normalizeHtmlEntities", () => {
  it("should decode numeric entities", () => {
    expect(normalizeHtmlEntities("&#72;&#101;&#108;&#108;&#111;")).toBe(
      "Hello",
    );
    expect(normalizeHtmlEntities("&#65;&#66;&#67;")).toBe("ABC");
  });

  it("should decode hex entities", () => {
    expect(normalizeHtmlEntities("&#x48;&#x65;&#x6C;&#x6C;&#x6F;")).toBe(
      "Hello",
    );
    expect(normalizeHtmlEntities("&#x41;&#x42;&#x43;")).toBe("ABC");
  });

  it("should remove non-printable entities", () => {
    expect(normalizeHtmlEntities("&#0;&#31;")).toBe("");
    expect(normalizeHtmlEntities("&#x00;&#x1F;")).toBe("");
  });

  it("should preserve normal text", () => {
    expect(normalizeHtmlEntities("Normal text")).toBe("Normal text");
  });
});

describe("sanitizeContent", () => {
  it("should apply all sanitization measures", () => {
    const testContent = `
      <!-- This is a comment -->
      <img alt="example alt text" src="image.jpg">
      ![example image description](screenshot.png)
      [click here](https://example.com "example title")
      <div data-prompt="example data" aria-label="example label">
        Normal text with hidden\u200Bcharacters
      </div>
      &#72;&#105;&#100;&#100;&#101;&#110; message
    `;

    const sanitized = sanitizeContent(testContent);

    expect(sanitized).not.toContain("<!-- This is a comment -->");
    expect(sanitized).not.toContain("example alt text");
    expect(sanitized).not.toContain("example image description");
    expect(sanitized).not.toContain("example title");
    expect(sanitized).not.toContain("example data");
    expect(sanitized).not.toContain("example label");
    expect(sanitized).not.toContain("\u200B");
    expect(sanitized).not.toContain("alt=");
    expect(sanitized).not.toContain("data-prompt=");
    expect(sanitized).not.toContain("aria-label=");

    expect(sanitized).toContain("Normal text with hiddencharacters");
    expect(sanitized).toContain("Hidden message");
    expect(sanitized).toContain('<img src="image.jpg">');
    expect(sanitized).toContain("![](screenshot.png)");
    expect(sanitized).toContain("[click here](https://example.com)");
  });

  it("should handle complex nested patterns", () => {
    const complexContent = `
      Text with ![alt \u200B text](image.png) and more.
      <a href="#" title="example\u00ADtitle">Link</a>
      <div data-x="&#72;&#105;">Content</div>
    `;

    const sanitized = sanitizeContent(complexContent);

    expect(sanitized).not.toContain("\u200B");
    expect(sanitized).not.toContain("\u00AD");
    expect(sanitized).not.toContain("alt ");
    expect(sanitized).not.toContain('title="');
    expect(sanitized).not.toContain('data-x="');
    expect(sanitized).toContain("![](image.png)");
    expect(sanitized).toContain('<a href="#">Link</a>');
  });

  it("should preserve legitimate markdown and HTML", () => {
    const legitimateContent = `
      # Heading
      
      This is **bold** and *italic* text.
      
      Here's a normal image: ![](normal.jpg)
      And a normal link: [Click here](https://example.com)
      
      <div class="container">
        <p id="para">Normal paragraph</p>
        <input type="text" name="field">
      </div>
    `;

    const sanitized = sanitizeContent(legitimateContent);

    expect(sanitized).toBe(legitimateContent);
  });

  it("should handle entity-encoded text", () => {
    const encodedText = `
      &#72;&#105;&#100;&#100;&#101;&#110; &#109;&#101;&#115;&#115;&#97;&#103;&#101;
      <div title="&#101;&#120;&#97;&#109;&#112;&#108;&#101;">Test</div>
    `;

    const sanitized = sanitizeContent(encodedText);

    expect(sanitized).toContain("Hidden message");
    expect(sanitized).not.toContain('title="');
    expect(sanitized).toContain("<div>Test</div>");
  });
});

describe("stripHtmlComments (legacy)", () => {
  it("should remove HTML comments", () => {
    expect(stripHtmlComments("Hello <!-- example -->World")).toBe(
      "Hello World",
    );
    expect(stripHtmlComments("<!-- comment -->Text")).toBe("Text");
    expect(stripHtmlComments("Text<!-- comment -->")).toBe("Text");
  });

  it("should handle multiline comments", () => {
    expect(stripHtmlComments("Hello <!-- \nexample\n -->World")).toBe(
      "Hello World",
    );
  });
});
