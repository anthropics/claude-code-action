import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";

export const GITHUB_TOKEN_FILE_ENV = "CLAUDE_CODE_GITHUB_TOKEN_FILE";

const MAX_TOKEN_BYTES = 16 * 1024;

async function readTokenFile(path: string): Promise<string> {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const nonBlock = constants.O_NONBLOCK ?? 0;
  // Where open cannot reject symlinks, at least reject an existing symlink
  // before opening the expected file in the action's private directory.
  if (!noFollow && !(await lstat(path)).isFile()) {
    throw new Error("Expected a regular file");
  }
  const file = await open(path, constants.O_RDONLY | noFollow | nonBlock);
  try {
    const status = await file.stat();
    if (!status.isFile() || status.size > MAX_TOKEN_BYTES) {
      throw new Error("Expected a small regular file");
    }
    const bytes = Buffer.alloc(status.size + 1);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== status.size) {
      throw new Error("Token file changed while reading");
    }
    return bytes.toString("utf8", 0, bytesRead);
  } finally {
    await file.close();
  }
}

export async function readGitHubToken(env = process.env): Promise<string> {
  const path = env[GITHUB_TOKEN_FILE_ENV];
  if (path === undefined) {
    if (!env.GITHUB_TOKEN) {
      throw new Error("GITHUB_TOKEN environment variable is required");
    }
    return env.GITHUB_TOKEN;
  }

  // The action may replace this file while the MCP server stays running.
  // A broken file must not send a request with an inherited, stale token.
  let contents: string;
  try {
    contents = await readTokenFile(path);
  } catch {
    throw new Error("Could not read the GitHub App token file");
  }

  const token = contents.replace(/\r?\n$/, "");
  if (!token || /[^A-Za-z0-9._-]/.test(token)) {
    throw new Error("GitHub App token file contains an invalid token");
  }
  return token;
}
