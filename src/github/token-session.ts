import * as core from "@actions/core";
import { randomUUID } from "crypto";
import { lstat, mkdtemp, realpath, rename, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, isAbsolute, join, relative, sep } from "path";
import { renewGitHubAppToken, revokeGitHubAppToken } from "./token";

// Leave five minutes for operations that started with the previous token.
export const TOKEN_RENEWAL_AGE_MS = 55 * 60 * 1000;
const RETRY_DELAY_MS = 60 * 1000;

async function writeToken(path: string, token: string): Promise<void> {
  if (!/^[A-Za-z0-9_.-]+$/.test(token) || token.length > 8192) {
    throw new Error("Invalid GitHub App installation token format");
  }
  const directory = dirname(path);
  if (
    !(await lstat(directory)).isDirectory() ||
    (await realpath(directory)) !== directory
  ) {
    throw new Error("Invalid GitHub App credential directory");
  }
  const pending = join(directory, randomUUID());
  try {
    await writeFile(pending, `${token}\n`, { mode: 0o600, flag: "wx" });
    await rename(pending, path);
  } finally {
    await rm(pending, { force: true });
  }
}

export async function getReplacementGitHubToken(current: string) {
  try {
    const replacement = await renewGitHubAppToken();
    if (replacement !== current) return replacement;
    core.warning("GitHub App exchange returned the current installation token");
  } catch {
    core.warning(
      "GitHub App token renewal failed. The current token remains in use.",
    );
  }
}

export class GitHubTokenSession {
  private timer?: ReturnType<typeof setTimeout>;
  private inFlight?: Promise<void>;
  private stopped = false;
  private previous?: string;

  private constructor(
    readonly tokenPath: string,
    private current: string,
    private obtainedAt: number,
    private publish: (current: string, previous: string) => void,
  ) {}

  static async create(
    token: string,
    obtainedAt: number,
    publish: (current: string, previous: string) => void,
  ) {
    const temp = await realpath(process.env.RUNNER_TEMP || tmpdir());
    const workspace = await realpath(
      process.env.GITHUB_WORKSPACE || process.cwd(),
    );
    const fromWorkspace = relative(workspace, temp);
    if (
      !isAbsolute(fromWorkspace) &&
      fromWorkspace !== ".." &&
      !fromWorkspace.startsWith(`..${sep}`)
    ) {
      throw new Error(
        "GitHub App credential directory must be outside the workspace",
      );
    }
    const directory = await mkdtemp(join(temp, "claude-github-token-"));
    try {
      const path = join(await realpath(directory), "token");
      await writeToken(path, token);
      return new GitHubTokenSession(path, token, obtainedAt, publish);
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  start() {
    this.schedule(
      Math.max(0, TOKEN_RENEWAL_AGE_MS - (Date.now() - this.obtainedAt)),
    );
  }

  private schedule(delay: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.inFlight = this.rotate();
    }, delay);
    this.timer.unref();
  }

  private async rotate() {
    const replacement = await getReplacementGitHubToken(this.current);
    if (!replacement) {
      this.schedule(RETRY_DELAY_MS);
      return;
    }
    try {
      await writeToken(this.tokenPath, replacement);
    } catch {
      await revokeGitHubAppToken(replacement);
      core.warning(
        "Could not update the GitHub App token used by the active session",
      );
      this.schedule(RETRY_DELAY_MS);
      return;
    }

    // An earlier token has aged out by a second rotation. Keep the most recent
    // prior token valid for Git and MCP operations that already read it.
    this.previous = this.current;
    this.current = replacement;
    this.obtainedAt = Date.now();
    try {
      this.publish(this.current, this.previous);
    } catch {
      core.warning("Could not record GitHub App token rotation for cleanup");
    }
    this.schedule(TOKEN_RENEWAL_AGE_MS);
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.inFlight;
    return {
      token: this.current,
      obtainedAt: this.obtainedAt,
      previous: this.previous,
    };
  }

  async restoreCurrentToken(token: string) {
    await writeToken(this.tokenPath, token);
  }

  async remove() {
    await rm(dirname(this.tokenPath), { recursive: true, force: true });
  }
}
