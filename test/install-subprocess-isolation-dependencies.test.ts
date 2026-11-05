import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const installer = new URL(
  "../scripts/install-subprocess-isolation-dependencies.sh",
  import.meta.url,
).pathname;

function writeExecutable(path: string, contents: string) {
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
}

describe("subprocess isolation dependency installer", () => {
  test("retries a timed-out apt command without hanging", () => {
    const directory = mkdtempSync(join(tmpdir(), "isolation-install-"));
    const log = join(directory, "timeout.log");

    writeExecutable(
      join(directory, "sudo"),
      `#!/usr/bin/env bash\nexec "$@"\n`,
    );
    writeExecutable(
      join(directory, "apt-get"),
      `#!/usr/bin/env bash\nsleep 1\n`,
    );
    writeExecutable(
      join(directory, "timeout"),
      `#!/usr/bin/env bash\necho "$*" >> "${log}"\nexit 124\n`,
    );
    writeExecutable(join(directory, "sleep"), `#!/usr/bin/env bash\nexit 0\n`);

    const result = Bun.spawnSync(["bash", installer], {
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual([
      "60 sudo apt-get update -qq",
      "60 sudo apt-get update -qq",
      "60 sudo apt-get update -qq",
    ]);
    expect(result.stdout.toString()).toContain(
      "apt-get attempt 3 failed or timed out, retrying...",
    );
  });

  test("installs packages after a successful update", () => {
    const directory = mkdtempSync(join(tmpdir(), "isolation-install-"));
    const log = join(directory, "apt.log");

    writeExecutable(
      join(directory, "sudo"),
      `#!/usr/bin/env bash\nexec "$@"\n`,
    );
    writeExecutable(
      join(directory, "apt-get"),
      `#!/usr/bin/env bash\necho "$*" >> "${log}"\n`,
    );
    writeExecutable(
      join(directory, "timeout"),
      `#!/usr/bin/env bash\nshift\nexec "$@"\n`,
    );

    const result = Bun.spawnSync(["bash", installer], {
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual([
      "update -qq",
      "install -y --no-install-recommends bubblewrap socat",
    ]);
  });
});
