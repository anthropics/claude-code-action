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

// Start of the next run of exactly `n` backticks at or after `from`, or -1.
function findBacktickRun(s: string, from: number, n: number): number {
  for (let j = s.indexOf("`", from); j !== -1; j = s.indexOf("`", j)) {
    let m = 0;
    while (s[j + m] === "`") m++;
    if (m === n) return j;
    j += m;
  }
  return -1;
}

// Maps each "[" to its closing "]" in one pass, as CommonMark nests them: brackets
// may nest, and escaped brackets and brackets inside code spans don't count.
function matchBrackets(s: string): Map<number, number> {
  const pairs = new Map<number, number>();
  const open: number[] = [];
  const unclosedRuns = new Set<number>();
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") {
      i++;
    } else if (c === "`") {
      let n = 1;
      while (s[i + n] === "`") n++;
      const end = unclosedRuns.has(n) ? -1 : findBacktickRun(s, i + n, n);
      if (end === -1) unclosedRuns.add(n);
      i = (end === -1 ? i : end) + n - 1;
    } else if (c === "[") {
      open.push(i);
    } else if (c === "]" && open.length > 0) {
      pairs.set(open.pop()!, i);
    }
  }
  return pairs;
}

export function stripMarkdownImageAltText(content: string): string {
  // ![alt](url) -> ![](url) and ![alt][ref] -> ![][ref]; the ref label is kept.
  const pairs = matchBrackets(content);
  let out = "";
  let last = 0;
  for (let i = content.indexOf("!["); i !== -1; i = content.indexOf("![", i)) {
    const close = pairs.get(i + 1);
    const next = close === undefined ? undefined : content[close + 1];
    if (close === undefined || (next !== "(" && next !== "[")) {
      i += 2;
      continue;
    }
    out += content.slice(last, i + 2);
    last = close;
    i = close;
  }
  return out + content.slice(last);
}

// An inline link tail `(dest "title")` as CommonMark parses it: groups are the
// destination, the title with the whitespace before it, and the closing paren.
const NO_PARENS = String.raw`(?:[^\s()\\]|\\.)`;
const NESTED_PARENS = [1, 2, 3].reduce(
  (inner) => String.raw`(?:${NO_PARENS}|\((?:${inner})*\))`,
  NO_PARENS,
);
const LINK_TAIL = new RegExp(
  String.raw`\((\s*(?:<(?:[^<>\n\\]|\\.)*>|${NESTED_PARENS}*))` +
    String.raw`(\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\((?:[^()\\]|\\.)*\)))` +
    String.raw`(\s*\))`,
  "y",
);

export function stripMarkdownLinkTitles(content: string): string {
  // [text](url "title"), [text](url 'title') and [text](url (title)) -> [text](url)
  const edits: { start: number; end: number; text: string }[] = [];
  for (const close of matchBrackets(content).values()) {
    LINK_TAIL.lastIndex = close + 1;
    const m = LINK_TAIL.exec(content);
    if (m) {
      edits.push({
        start: close + 1,
        end: LINK_TAIL.lastIndex,
        text: `(${m[1]}${m[3]}`,
      });
    }
  }
  // Links nest inside each other's text (e.g. a badge image inside a link), so apply in order.
  edits.sort((a, b) => a.start - b.start);
  let out = "";
  let last = 0;
  for (const { start, end, text } of edits) {
    if (start < last) continue;
    out += content.slice(last, start) + text;
    last = end;
  }
  return out + content.slice(last);
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

export const stripHtmlComments = (content: string) =>
  content.replace(/<!--[\s\S]*?-->/g, "");
