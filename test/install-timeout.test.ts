import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  buildInstallCommand,
  installClaudeCode,
  runInstallCommand,
} from "../src/entrypoints/run";

// Long enough for bash to start and install its traps before the deadline.
const TIMEOUT_MS = 500;
const KILL_GRACE_MS = 500;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForExit(pid: number): Promise<boolean> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

describe("runInstallCommand", () => {
  let tempDir: string;
  let pidFile: string;
  const readPid = () => parseInt(readFileSync(pidFile, "utf8").trim(), 10);

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "install-timeout-"));
    pidFile = join(tempDir, "pid");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("resolves when the command exits 0", async () => {
    await expect(
      runInstallCommand("exit 0", TIMEOUT_MS, KILL_GRACE_MS),
    ).resolves.toBeUndefined();
  });

  it("rejects with the exit code when the command fails", async () => {
    await expect(
      runInstallCommand("exit 3", TIMEOUT_MS, KILL_GRACE_MS),
    ).rejects.toThrow("Install failed with exit code 3");
  });

  it("reports a failed curl through pipefail", async () => {
    const unreachable = buildInstallCommand("2.1.114").replace(
      "https://claude.ai/install.sh",
      "http://127.0.0.1:1/install.sh",
    );

    await expect(
      runInstallCommand(unreachable, 5000, KILL_GRACE_MS),
    ).rejects.toThrow("Install failed with exit code 7");
  });

  it("rejects without signalling when bash cannot be spawned", async () => {
    const originalPath = process.env.PATH;
    const kill = spyOn(process, "kill");
    process.env.PATH = tempDir;
    try {
      await expect(runInstallCommand("exit 0", 50, 50)).rejects.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(kill).not.toHaveBeenCalled();
    } finally {
      process.env.PATH = originalPath;
      kill.mockRestore();
    }
  });

  async function startBunInstall(command: string, killGraceMs: number) {
    const entry = join(import.meta.dir, "../src/entrypoints/run");
    const script = `import { runInstallCommand } from ${JSON.stringify(entry)};
      await runInstallCommand(${JSON.stringify(command)}, 60000, ${killGraceMs});`;
    const bun = Bun.spawn([process.execPath, "-e", script], {
      stdio: ["ignore", "ignore", "ignore"],
    });

    const deadline = Date.now() + 8000;
    while (!existsSync(pidFile) || !readFileSync(pidFile, "utf8").trim()) {
      if (Date.now() > deadline) throw new Error("install never started");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return bun;
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    it(`forwards ${signal} to the install and still terminates Bun`, async () => {
      const bun = await startBunInstall(
        `echo $$ > "${pidFile}"; exec sleep 30`,
        KILL_GRACE_MS,
      );

      bun.kill(signal);
      await bun.exited;

      expect(bun.signalCode).toBe(signal);
      expect(await waitForExit(readPid())).toBe(true);
    }, 15_000);

    it(`kills a descendant that ignores a forwarded ${signal}`, async () => {
      const bun = await startBunInstall(
        `sh -c 'trap "" INT TERM; echo $$ > "${pidFile}"; exec sleep 30' & wait`,
        KILL_GRACE_MS,
      );

      bun.kill(signal);
      await bun.exited;

      expect(bun.signalCode).toBe(signal);
      expect(await waitForExit(readPid())).toBe(true);
    }, 15_000);

    it(`escalates when bash ignores repeated ${signal}`, async () => {
      const bun = await startBunInstall(
        `trap '' INT TERM; echo $$ > "${pidFile}"; sleep 30`,
        KILL_GRACE_MS,
      );

      bun.kill(signal);
      await new Promise((resolve) => setTimeout(resolve, 100));
      bun.kill(signal);
      await bun.exited;

      expect(bun.signalCode).toBe(signal);
      expect(await waitForExit(readPid())).toBe(true);
    }, 15_000);
  }

  it("removes signal listeners after every outcome", async () => {
    const before = process.listenerCount("SIGTERM");

    await runInstallCommand("exit 0", TIMEOUT_MS, KILL_GRACE_MS);
    await expect(
      runInstallCommand("exit 3", TIMEOUT_MS, KILL_GRACE_MS),
    ).rejects.toThrow("exit code 3");
    await expect(
      runInstallCommand("exec sleep 30", TIMEOUT_MS, KILL_GRACE_MS),
    ).rejects.toThrow("timed out");

    expect(process.listenerCount("SIGTERM")).toBe(before);
  });

  it("rejects a child that handles SIGTERM and exits 0 after the deadline", async () => {
    await expect(
      runInstallCommand(
        `trap 'exit 0' TERM; sleep 30 & wait`,
        TIMEOUT_MS,
        KILL_GRACE_MS,
      ),
    ).rejects.toThrow(`Install timed out after ${TIMEOUT_MS}ms`);
  });

  it("clears the kill timer when the child exits during the grace period", async () => {
    const graceMs = 2000;
    const kill = spyOn(process, "kill");
    try {
      await expect(
        runInstallCommand(`trap '' TERM; sleep 1`, TIMEOUT_MS, graceMs),
      ).rejects.toThrow("timed out");
      // SIGTERM at the deadline and SIGKILL on exit. A leaked kill timer
      // would add a third signal once the grace period ends.
      await new Promise((resolve) => setTimeout(resolve, graceMs));
      expect(kill).toHaveBeenCalledTimes(2);
    } finally {
      kill.mockRestore();
    }
  }, 10_000);

  it("signals only bash when process groups are unavailable", async () => {
    // Exercises the Windows branch on POSIX; it does not test real Windows.
    const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
    const kill = spyOn(process, "kill");
    Object.defineProperty(process, "platform", {
      ...platform,
      value: "win32",
    });
    try {
      await expect(
        runInstallCommand("exec sleep 30", TIMEOUT_MS, KILL_GRACE_MS),
      ).rejects.toThrow("timed out");
      expect(kill).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process, "platform", platform);
      kill.mockRestore();
    }
  });

  it("rejects when a command stalls past the deadline", async () => {
    await expect(
      runInstallCommand("sleep 30", TIMEOUT_MS, KILL_GRACE_MS),
    ).rejects.toThrow(`Install timed out after ${TIMEOUT_MS}ms`);
  });

  it("bounds the real curl pipeline against a server that never responds", async () => {
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => new Promise<Response>(() => {}),
    });
    try {
      const stalled = buildInstallCommand("2.1.114").replace(
        "https://claude.ai/install.sh",
        `http://127.0.0.1:${server.port}/install.sh`,
      );
      await expect(
        runInstallCommand(stalled, TIMEOUT_MS, KILL_GRACE_MS),
      ).rejects.toThrow("timed out");
    } finally {
      server.stop(true);
    }
  });

  it("kills every process in the pipeline, not only bash", async () => {
    const pipeline = `sh -c 'echo $$ > "${pidFile}"; exec sleep 30' | cat`;

    await expect(
      runInstallCommand(pipeline, TIMEOUT_MS, KILL_GRACE_MS),
    ).rejects.toThrow("timed out");

    expect(await waitForExit(readPid())).toBe(true);
  });

  it("escalates to SIGKILL when the command ignores SIGTERM", async () => {
    const stubborn = `trap '' TERM; echo $$ > "${pidFile}"; sleep 30`;
    const startedAt = Date.now();

    await expect(
      runInstallCommand(stubborn, TIMEOUT_MS, KILL_GRACE_MS),
    ).rejects.toThrow("timed out");

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(
      TIMEOUT_MS + KILL_GRACE_MS - 50,
    );
    expect(await waitForExit(readPid())).toBe(true);
  });

  it("kills a descendant that outlives bash after SIGTERM", async () => {
    const survivor = `sh -c 'trap "" TERM; echo $$ > "${pidFile}"; exec sleep 30' & wait`;

    await expect(
      runInstallCommand(survivor, TIMEOUT_MS, KILL_GRACE_MS),
    ).rejects.toThrow("timed out");

    expect(await waitForExit(readPid())).toBe(true);
  });

  it("does not signal anything after a fast success", async () => {
    const kill = spyOn(process, "kill");
    try {
      await runInstallCommand("exit 0", 50, 50);
      // Wait past the deadline: a leaked timer would signal the old group.
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(kill).not.toHaveBeenCalled();
    } finally {
      kill.mockRestore();
    }
  });
});

describe("installClaudeCode", () => {
  const savedEnv = { ...process.env };
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "install-retry-"));
    delete process.env.GITHUB_PATH;
    delete process.env.PATH_TO_CLAUDE_CODE_EXECUTABLE;
    process.env.HOME = tempDir;
    process.env.PATH = `${tempDir}:${savedEnv.PATH}`;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("retries a timed-out attempt only after it has been killed", async () => {
    const firstPid = join(tempDir, "first-pid");
    const overlap = join(tempDir, "overlap");
    const secondAttempt = join(tempDir, "second-attempt");
    // A stand-in curl: the first attempt stalls, the second serves a script
    // that installs nothing and exits 0.
    writeFileSync(
      join(tempDir, "curl"),
      `#!/bin/bash
if [ ! -f "${firstPid}" ]; then
  echo $$ > "${firstPid}"
  exec sleep 30
fi
kill -0 "$(cat "${firstPid}")" 2>/dev/null && touch "${overlap}"
touch "${secondAttempt}"
echo 'exit 0'
`,
    );
    chmodSync(join(tempDir, "curl"), 0o755);

    const log = spyOn(console, "log");
    try {
      await expect(installClaudeCode(TIMEOUT_MS)).resolves.toBe(
        `${tempDir}/.local/bin/claude`,
      );
      expect(log).toHaveBeenCalledWith(
        `Installation failed, retrying: Error: Install timed out after ${TIMEOUT_MS}ms`,
      );
    } finally {
      log.mockRestore();
    }

    expect(existsSync(secondAttempt)).toBe(true);
    expect(existsSync(overlap)).toBe(false);
  }, 15_000);

  it("skips the install when a custom executable is provided", async () => {
    const curlRan = join(tempDir, "curl-ran");
    writeFileSync(join(tempDir, "curl"), `#!/bin/bash\ntouch "${curlRan}"\n`);
    chmodSync(join(tempDir, "curl"), 0o755);
    process.env.PATH_TO_CLAUDE_CODE_EXECUTABLE = "/opt/claude/bin/claude";

    await expect(installClaudeCode()).resolves.toBe("/opt/claude/bin/claude");

    expect(existsSync(curlRan)).toBe(false);
  });
});
