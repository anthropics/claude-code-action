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

function stripImageAltText(content: string, marker: "(" | "["): string {
  const parts: string[] = [];
  let scan = 0;
  let copied = 0;

  while ((scan = content.indexOf("![", scan)) !== -1) {
    const altEnd = content.indexOf("]", scan + 2);
    if (altEnd === -1) break;
    if (content[altEnd + 1] !== marker) {
      scan = altEnd + 1;
      continue;
    }

    if (marker === "[") {
      const labelEnd = content.indexOf("]", altEnd + 2);
      if (labelEnd === -1) {
        scan = altEnd + 1;
        continue;
      }
      parts.push(
        content.slice(copied, scan),
        "![]",
        content.slice(altEnd + 1, labelEnd + 1),
      );
      scan = labelEnd + 1;
    } else {
      parts.push(content.slice(copied, scan), "![](");
      scan = altEnd + 2;
    }
    copied = scan;
  }

  if (parts.length === 0) return content;
  parts.push(content.slice(copied));
  return parts.join("");
}

export function stripMarkdownImageAltText(content: string): string {
  // Keep reference labels; only remove hidden image alt text.
  return stripImageAltText(stripImageAltText(content, "("), "[");
}

function stripLinkTitle(content: string, quote: '"' | "'"): string {
  const parts: string[] = [];
  let copied = 0;
  let scan = 0;

  while (true) {
    const start = content.indexOf("[", scan);
    if (start === -1) break;
    const labelEnd = content.indexOf("]", start + 1);
    if (labelEnd === -1) break;
    if (content[labelEnd + 1] !== "(") {
      scan = labelEnd + 1;
      continue;
    }

    const urlStart = labelEnd + 2;
    const endParen = content.indexOf(")", urlStart);
    const limit = endParen === -1 ? content.length : endParen;
    let titleStart = -1;
    let titleEnd = -1;

    // The original greedy match strips the last quoted title before ')'.
    for (let i = urlStart + 2; i < limit; i++) {
      if (content[i] !== quote || !/\s/.test(content[i - 1]!)) continue;
      const closingQuote = content.indexOf(quote, i + 1);
      if (closingQuote === -1) break;
      titleStart = i - 1;
      titleEnd = closingQuote + 1;
      i = closingQuote;
    }

    if (titleStart !== -1) {
      parts.push(content.slice(copied, titleStart));
      copied = titleEnd;
      scan = titleEnd;
    } else {
      scan = endParen === -1 ? content.length : endParen + 1;
    }
  }

  if (parts.length === 0) return content;
  parts.push(content.slice(copied));
  return parts.join("");
}

export function stripMarkdownLinkTitles(content: string): string {
  return stripLinkTitle(stripLinkTitle(content, '"'), "'");
}

export function stripHiddenAttributes(content: string): string {
  // Quoted values are matched per quote type so that a value containing the
  // other quote character (e.g. an apostrophe inside a double-quoted value)
  // does not terminate the match early and mangle surrounding content (#1366).
  content = content.replace(/\salt\s*=\s*"[^"]*"/gi, "");
  content = content.replace(/\salt\s*=\s*'[^']*'/gi, "");
  content = content.replace(/\salt\s*=\s*[^\s>]+/gi, "");
  content = content.replace(/\stitle\s*=\s*"[^"]*"/gi, "");
  content = content.replace(/\stitle\s*=\s*'[^']*'/gi, "");
  content = content.replace(/\stitle\s*=\s*[^\s>]+/gi, "");
  content = content.replace(/\saria-label\s*=\s*"[^"]*"/gi, "");
  content = content.replace(/\saria-label\s*=\s*'[^']*'/gi, "");
  content = content.replace(/\saria-label\s*=\s*[^\s>]+/gi, "");
  content = content.replace(/\sdata-[a-zA-Z0-9-]+\s*=\s*"[^"]*"/gi, "");
  content = content.replace(/\sdata-[a-zA-Z0-9-]+\s*=\s*'[^']*'/gi, "");
  content = content.replace(/\sdata-[a-zA-Z0-9-]+\s*=\s*[^\s>]+/gi, "");
  content = content.replace(/\splaceholder\s*=\s*"[^"]*"/gi, "");
  content = content.replace(/\splaceholder\s*=\s*'[^']*'/gi, "");
  content = content.replace(/\splaceholder\s*=\s*[^\s>]+/gi, "");
  return content;
}

export function normalizeHtmlEntities(content: string): string {
  content = content.replace(/&#(\d+);/g, (_, dec) => {
    const num = parseInt(dec, 10);
    if (num >= 32 && num <= 126) {
      return String.fromCharCode(num);
    }
    return "";
  });
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
  content = stripHtmlComments(content);
  content = stripInvisibleCharacters(content);
  content = stripMarkdownImageAltText(content);
  content = stripMarkdownLinkTitles(content);
  content = stripHiddenAttributes(content);
  content = normalizeHtmlEntities(content);
  content = redactGitHubTokens(content);
  return content;
}

/**
 * Redact well-known credential formats (GitHub, Anthropic, AWS, Slack, JWTs)
 * from arbitrary text. Callers don't need to know which vendor a value belongs to.
 *
 * Vendor-prefixed formats are matched without a leading word boundary: the
 * prefix already anchors them, and runtime output frequently puts a word
 * character directly against the value (e.g. an ANSI color code ending in `m`,
 * or a serialized JSON escape such as `\n`).
 */
export function redactSecrets(content: string): string {
  content = redactGitHubTokens(content);

  // Anthropic API keys: sk-ant-...
  content = content.replace(
    /sk-ant-[A-Za-z0-9_-]{20,}/g,
    "[REDACTED_ANTHROPIC_KEY]",
  );

  // AWS access key ids: AKIA/ASIA followed by 16 uppercase alphanumerics. All
  // uppercase alphanumeric, so keep a leading boundary to avoid matching inside
  // larger blobs; also treat a JSON escape or ANSI color code as a boundary.
  content = content.replace(
    /(?:\b|(?<=\\(?:[nrtbf"\\/]|u[0-9a-fA-F]{4}))|(?<=\[[0-9;]*m))(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    "[REDACTED_AWS_KEY_ID]",
  );

  // Slack tokens: xoxb-, xoxp-, xoxa-, xoxs-, xoxr-
  content = content.replace(
    /xox[abpsr]-[A-Za-z0-9-]{10,}/g,
    "[REDACTED_SLACK_TOKEN]",
  );

  // JWT-shaped strings: three base64url segments, the first two starting
  // with eyJ (base64 of `{"`).
  content = content.replace(
    /eyJ[A-Za-z0-9_-]{10,2000}\.eyJ[A-Za-z0-9_-]{10,4000}\.[A-Za-z0-9_-]{10,2000}\b/g,
    "[REDACTED_JWT]",
  );

  return content;
}

export function redactGitHubTokens(content: string): string {
  // GitHub Personal Access Tokens (classic): ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX (40 chars)
  content = content.replace(
    /ghp_[A-Za-z0-9]{36}\b/g,
    "[REDACTED_GITHUB_TOKEN]",
  );

  // GitHub OAuth tokens: gho_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX (40 chars)
  content = content.replace(
    /gho_[A-Za-z0-9]{36}\b/g,
    "[REDACTED_GITHUB_TOKEN]",
  );

  // GitHub user-to-server tokens: ghu_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX (40 chars)
  content = content.replace(
    /ghu_[A-Za-z0-9]{36}\b/g,
    "[REDACTED_GITHUB_TOKEN]",
  );

  // GitHub installation tokens: ghs_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX (40 chars)
  content = content.replace(
    /ghs_[A-Za-z0-9]{36}\b/g,
    "[REDACTED_GITHUB_TOKEN]",
  );

  // GitHub refresh tokens: ghr_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX (40 chars)
  content = content.replace(
    /ghr_[A-Za-z0-9]{36}\b/g,
    "[REDACTED_GITHUB_TOKEN]",
  );

  // GitHub fine-grained personal access tokens: github_pat_XXXXXXXXXX (up to 255 chars)
  content = content.replace(
    /github_pat_[A-Za-z0-9_]{11,221}\b/g,
    "[REDACTED_GITHUB_TOKEN]",
  );

  return content;
}

export function stripHtmlComments(content: string): string {
  const parts: string[] = [];
  let copied = 0;

  while (true) {
    const start = content.indexOf("<!--", copied);
    if (start === -1) break;
    const end = content.indexOf("-->", start + 4);
    if (end === -1) break;
    parts.push(content.slice(copied, start));
    copied = end + 3;
  }

  if (parts.length === 0) return content;
  parts.push(content.slice(copied));
  return parts.join("");
}
