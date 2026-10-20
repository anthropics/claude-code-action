/**
 * Decides whether a file has to be committed as a base64 blob instead of being
 * inlined in the Git tree as UTF-8 text.
 *
 * Inlining is only safe for content that survives a UTF-8 decode untouched;
 * anything else gets its invalid bytes replaced during the decode, which
 * silently corrupts the committed file. A NUL byte is treated as binary for the
 * same reason Git does it: no text file carries one, and it is the cheapest
 * signal available.
 */
export function isBinaryContent(content: Buffer): boolean {
  if (content.includes(0)) {
    return true;
  }

  try {
    new TextDecoder("utf-8", { fatal: true }).decode(content);
    return false;
  } catch {
    return true;
  }
}
