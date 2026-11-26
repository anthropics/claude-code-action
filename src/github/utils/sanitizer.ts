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

function findClosingBracket(content: string, start: number): number {
  // `start` points just past the opening `[`. CommonMark link text and image
  // alt text can hold nested brackets, and `\]` is a literal bracket rather
  // than a closer, so the first `]` is not necessarily the end.
  let depth = 0;
  for (let i = start; i < content.length; i += 1) {
    const char = content[i];
    if (char === "\\") {
      i += 1;
      continue;
    }
    if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      if (depth === 0) {
        return i;
      }
      depth -= 1;
    }
  }
  return -1;
}

function findClosingParen(content: string, start: number): number {
  // `start` points just past the opening `(`. Parentheses inside the
  // destination can be balanced (e.g. `.../Foo_(bar)`) and a quoted title can
  // contain `)` too, so count nested parentheses outside quotes.
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < content.length; i += 1) {
    const char = content[i];
    if (char === "\\") {
      i += 1;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (
      (char === '"' || char === "'") &&
      (i === start || /\s/.test(content[i - 1] ?? ""))
    ) {
      quote = char;
      continue;
    }
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      if (depth === 0) {
        return i;
      }
      depth -= 1;
    }
  }
  return -1;
}

function isMarkdownTitle(value: string): boolean {
  if (value.length < 2) {
    return false;
  }
  const first = value[0];
  const last = value[value.length - 1];
  if (first === '"' || first === "'") {
    if (last !== first) {
      return false;
    }
    for (let i = 1; i < value.length - 1; i += 1) {
      if (value[i] === "\\") {
        i += 1;
        continue;
      }
      if (value[i] === first) {
        return false;
      }
    }
    return true;
  }
  if (first === "(" && last === ")") {
    let depth = 0;
    for (let i = 0; i < value.length; i += 1) {
      const char = value[i];
      if (char === "\\") {
        i += 1;
        continue;
      }
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
        if (depth < 0 || (depth === 0 && i !== value.length - 1)) {
          return false;
        }
      }
    }
    return depth === 0;
  }
  return false;
}

function findLinkTitleStart(destination: string): number {
  // A title follows the destination after whitespace. Unbracketed destinations
  // cannot contain whitespace, so the first top-level whitespace starts the
  // title candidate; accept it only if the remainder is a complete title.
  let depth = 0;
  for (let i = 0; i < destination.length; i += 1) {
    const char = destination.charAt(i);
    if (char === "\\") {
      i += 1;
      continue;
    }
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0 && /\s/.test(char)) {
      return isMarkdownTitle(destination.slice(i).trim()) ? i : -1;
    }
  }
  return -1;
}

export function stripMarkdownImageAltText(content: string): string {
  // Drop the alt text of inline and reference-style images, including alt text
  // with nested or escaped brackets: ![alt](url) -> ![](url),
  // ![alt][ref] -> ![][ref].
  let result = "";
  let i = 0;
  while (i < content.length) {
    if (content[i] === "!" && content[i + 1] === "[") {
      const altEnd = findClosingBracket(content, i + 2);
      if (altEnd !== -1) {
        const after = content[altEnd + 1];
        if (after === "(" || after === "[") {
          result += "![]";
          i = altEnd + 1;
          continue;
        }
      }
    }
    result += content[i];
    i += 1;
  }
  return result;
}

export function stripMarkdownLinkTitles(content: string): string {
  // Drop quoted and parenthesised link titles, including link text with nested
  // or escaped brackets: [text](url "title") -> [text](url).
  let result = "";
  let i = 0;
  while (i < content.length) {
    if (content[i] === "[") {
      const textEnd = findClosingBracket(content, i + 1);
      if (textEnd !== -1 && content[textEnd + 1] === "(") {
        const destinationStart = textEnd + 2;
        const destinationEnd = findClosingParen(content, destinationStart);
        if (destinationEnd !== -1) {
          const destination = content.slice(destinationStart, destinationEnd);
          const titleStart = findLinkTitleStart(destination);
          if (titleStart !== -1) {
            result +=
              content.slice(i, destinationStart + titleStart).trimEnd() + ")";
          } else {
            result += content.slice(i, destinationEnd + 1);
          }
          i = destinationEnd + 1;
          continue;
        }
      }
    }
    result += content[i];
    i += 1;
  }
  return result;
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
