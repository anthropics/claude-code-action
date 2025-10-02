import type { Response } from "node-fetch";

export class GitLabError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "GitLabError";
  }
}

export async function assertResponseOk(response: Response, context: string) {
  if (!response.ok) {
    let detail = "";
    try {
      const data = await response.json();
      detail = typeof data === "string" ? data : JSON.stringify(data);
    } catch (_) {
      try {
        detail = await response.text();
      } catch (_) {
        // ignore
      }
    }
    throw new GitLabError(
      `${context} failed: ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ""}`,
      response.status,
    );
  }
}

