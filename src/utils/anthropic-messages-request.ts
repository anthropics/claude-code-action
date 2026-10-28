const DEFAULT_BASE_URL = "https://api.anthropic.com";

export function messagesUrl(baseUrl: string | undefined): string {
  const base = baseUrl?.trim().replace(/\/+$/, "") || DEFAULT_BASE_URL;
  return `${base}/v1/messages`;
}

export function parseCustomHeaders(
  raw: string | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of (raw ?? "").split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim();
    if (name) headers[name] = line.slice(colon + 1).trim();
  }
  return headers;
}
