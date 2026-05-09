export function stripInvisibleCharacters(content: string): string {
  content = content.replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
  content = content.replace(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g,
    "",
  );
  content = content.replace(/\u00AD/g, "");
  content = content.replace(/[\u202A-\u202E\u2066-\u2069]/g, "");
  return content;
}

export function stripMarkdownImageAltText(content: string): string {
  return content.replace(/!\[[^\]]*\]\(/g, "![](");
}

export function stripMarkdownLinkTitles(content: string): string {
  content = content.replace(/(\[[^\]]*\]\([^)]+)\s+"[^"]*"/g, "$1");
  content = content.replace(/(\[[^\]]*\]\([^)]+)\s+'[^']*'/g, "$1");
  return content;
}

export function stripHiddenAttributes(content: string): string {
  content = content.replace(/\salt\s*=\s*["'][^"']*["']/gi, "");
  content = content.replace(/\salt\s*=\s*[^\s>]+/gi, "");
  content = content.replace(/\stitle\s*=\s*["'][^"']*["']/gi, "");
  content = content.replace(/\stitle\s*=\s*[^\s>]+/gi, "");
  content = content.replace(/\saria-label\s*=\s*["'][^"']*["']/gi, "");
  content = content.replace(/\saria-label\s*=\s*[^\s>]+/gi, "");
  content = content.replace(/\sdata-[a-zA-Z0-9-]+\s*=\s*["'][^"']*["']/gi, "");
  content = content.replace(/\sdata-[a-zA-Z0-9-]+\s*=\s*[^\s>]+/gi, "");
  content = content.replace(/\splaceholder\s*=\s*["'][^"']*["']/gi, "");
  content = content.replace(/\splaceholder\s*=\s*[^\s>]+/gi, "");
  return content;
}

// Named HTML entities that map to ASCII characters. These must be decoded
// before sanitization so that entity-encoded markup (e.g. &lt;!-- ... --&gt;)
// is converted to literal characters that subsequent stripping steps can match.
const NAMED_ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&apos;": "'",
  "&sol;": "/",
  "&bsol;": "\\",
  "&lpar;": "(",
  "&rpar;": ")",
  "&lsqb;": "[",
  "&rsqb;": "]",
  "&lcub;": "{",
  "&rcub;": "}",
  "&excl;": "!",
  "&num;": "#",
  "&dash;": "-",
  "&hyphen;": "-",
};

// Semicolon-less legacy entity variants for the security-critical tokens.
// Browsers historically accept &lt, &gt, &amp, &quot, &apos without a
// trailing semicolon, which attackers can exploit to bypass sanitizers that
// only match the semicolon-terminated forms.  We list these separately so we
// can apply a safe boundary check (must NOT be followed by an alphanumeric
// character or '_') to avoid false positives such as mis-matching "&lte" as
// "&lt".
const LEGACY_ENTITIES: Record<string, string> = {
  "&lt": "<",
  "&gt": ">",
  "&amp": "&",
  "&quot": '"',
  "&apos": "'",
};

// Build the full pattern.
// - Semicolon-terminated entities are matched literally (e.g. /&lt;/gi).
// - Semicolon-less legacy entities are matched with a negative lookahead that
//   ensures the next character is NOT a word character (letter, digit, or '_')
//   and NOT a semicolon (which would have been caught by the first group).
//   This prevents "&lte" from matching as "&lt".
const NAMED_ENTITY_PATTERN = new RegExp(
  [
    ...Object.keys(NAMED_ENTITIES).map((e) =>
      e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ),
    ...Object.keys(LEGACY_ENTITIES).map(
      (e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w;])",
    ),
  ].join("|"),
  "gi",
);

// Merge lookup table used by the replace callback.
const ALL_ENTITIES: Record<string, string> = {
  ...NAMED_ENTITIES,
  ...LEGACY_ENTITIES,
};

export function normalizeHtmlEntities(content: string): string {
  // Decode named HTML entities (e.g. &lt; → <, &gt; → >, &amp; → &)
  // This must happen so that entity-encoded HTML comments like
  // &lt;!-- hidden --&gt; are converted to <!-- hidden --> and can be
  // stripped by stripHtmlComments.  Semicolon-less legacy forms (e.g. &lt,
  // &gt) are also decoded to prevent bypass via omission of the semicolon.
  content = content.replace(NAMED_ENTITY_PATTERN, (match) => {
    const lower = match.toLowerCase();
    // First try an exact match (covers semicolon-terminated forms like "&lt;").
    // Then try without a trailing semicolon (covers legacy forms like "&lt").
    return ALL_ENTITIES[lower] ?? ALL_ENTITIES[lower.replace(/;$/, "")] ?? match;
  });

  // Decode decimal numeric entities (e.g. &#60; → <)
  content = content.replace(/&#(\d+);/g, (_, dec) => {
    const num = parseInt(dec, 10);
    if (num >= 32 && num <= 126) {
      return String.fromCharCode(num);
    }
    return "";
  });

  // Decode hex numeric entities (e.g. &#x3C; → <)
  content = content.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    const num = parseInt(hex, 16);
    if (num >= 32 && num <= 126) {
      return String.fromCharCode(num);
    }
    return "";
  });
  return content;
}

export function sanitizeContent(content: string): string {
  // Decode HTML entities FIRST so that entity-encoded markup is converted to
  // literal characters before subsequent steps attempt to match and strip it.
  // Without this, &lt;!-- ... --&gt; bypasses stripHtmlComments entirely.
  // Run twice to catch double-encoded entities (e.g. &amp;lt; → &lt; → <).
  content = normalizeHtmlEntities(content);
  content = normalizeHtmlEntities(content);
  content = stripHtmlComments(content);
  content = stripInvisibleCharacters(content);
  content = stripMarkdownImageAltText(content);
  content = stripMarkdownLinkTitles(content);
  content = stripHiddenAttributes(content);
  content = redactGitHubTokens(content);
  return content;
}

export function redactGitHubTokens(content: string): string {
  // GitHub Personal Access Tokens (classic): ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX (40 chars)
  content = content.replace(
    /\bghp_[A-Za-z0-9]{36}\b/g,
    "[REDACTED_GITHUB_TOKEN]",
  );

  // GitHub OAuth tokens: gho_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX (40 chars)
  content = content.replace(
    /\bgho_[A-Za-z0-9]{36}\b/g,
    "[REDACTED_GITHUB_TOKEN]",
  );

  // GitHub installation tokens: ghs_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX (40 chars)
  content = content.replace(
    /\bghs_[A-Za-z0-9]{36}\b/g,
    "[REDACTED_GITHUB_TOKEN]",
  );

  // GitHub refresh tokens: ghr_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX (40 chars)
  content = content.replace(
    /\bghr_[A-Za-z0-9]{36}\b/g,
    "[REDACTED_GITHUB_TOKEN]",
  );

  // GitHub fine-grained personal access tokens: github_pat_XXXXXXXXXX (up to 255 chars)
  content = content.replace(
    /\bgithub_pat_[A-Za-z0-9_]{11,221}\b/g,
    "[REDACTED_GITHUB_TOKEN]",
  );

  return content;
}

export const stripHtmlComments = (content: string) =>
  content.replace(/<!--[\s\S]*?-->/g, "");
