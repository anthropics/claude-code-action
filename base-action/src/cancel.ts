import * as core from "@actions/core";
import { spawnSync } from "child_process";
import { readdirSync, readFileSync } from "fs";

// The runner sends SIGINT, SIGTERM after 7.5 seconds, and kills the step 2.5 seconds
// later, so a cancel that starts with SIGTERM has to fit into that.
const GRACE_MS = 1000;
const PAUSE_MS = 500;
const POLL_MS = 50;

type Process = { pid: number; parent: number };

function listProcesses(): Process[] {
  if (process.platform === "linux") {
    return readdirSync("/proc")
      .filter((name) => /^\d+$/.test(name))
      .flatMap((name) => {
        try {
          const stat = readFileSync(`/proc/${name}/stat`, "utf8");
          // The command's name comes before these fields and can hold anything.
          const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
          const threads = Number(fields[17]);
          // This process can't reap its children while it waits for them. One whose
          // first thread has ended, but not its others, is a zombie here too.
          if (fields[0] === "Z" && threads <= 1) return [];
          return [{ pid: Number(name), parent: Number(fields[1]) }];
        } catch {
          return []; // It has ended
        }
      });
  }
  if (process.platform === "win32") return []; // The runner's Ctrl+C reaches these
  // By path, because a session may be able to write to a directory in PATH
  const ps = spawnSync("/bin/ps", ["-A", "-o", "pid=,ppid=,state="], {
    encoding: "utf8",
  });
  if (ps.error) throw ps.error;
  if (ps.status !== 0) throw new Error("ps failed");
  return ps.stdout.split("\n").flatMap((line) => {
    const [pid, parent, state] = line.trim().split(/\s+/);
    if (!pid || Number(pid) === ps.pid || state!.startsWith("Z")) return [];
    return [{ pid: Number(pid), parent: Number(parent) }];
  });
}

/** What these processes have started, and they themselves, if still running. */
function listTree(roots: Iterable<number>): Set<number> {
  const processes = listProcesses();
  const running = new Set(processes.map(({ pid }) => pid));
  const children = new Map<number, number[]>();
  for (const { pid, parent } of processes) {
    children.set(parent, [...(children.get(parent) ?? []), pid]);
  }
  const tree = new Set([...roots].filter((pid) => running.has(pid)));
  // A set's iterator also visits what is added meanwhile.
  for (const pid of tree)
    children.get(pid)?.forEach((child) => tree.add(child));
  tree.delete(process.pid);
  return tree;
}

const cannotSignal = new Set<number>();

function signal(pids: Iterable<number>, name: NodeJS.Signals): void {
  for (const pid of pids) {
    try {
      process.kill(pid, name);
    } catch (error) {
      if ((error as { code?: string }).code === "EPERM") cannotSignal.add(pid);
    }
  }
}

/**
 * Stops everything this process started that is still in its process tree. Programs
 * first get to clean up after themselves, as git does with its lock files. They are
 * paused before each signal, because what a process starts while it is being stopped
 * would leave the tree.
 */
export function stopDescendants(): void {
  const known = new Set<number>();
  // What one of these started stays known once that one has ended.
  const update = () => {
    const running = listTree([process.pid, ...known]);
    known.clear();
    running.forEach((pid) => known.add(pid));
    return known;
  };
  const pause = () => {
    const paused = new Set<number>();
    for (const end = Date.now() + PAUSE_MS; Date.now() < end; ) {
      const added = [...update()].filter((pid) => !paused.has(pid));
      if (added.length === 0) return;
      signal(added, "SIGSTOP");
      added.forEach((pid) => paused.add(pid));
    }
  };

  try {
    pause();
    signal(known, "SIGTERM");
    signal(known, "SIGCONT");
    for (const end = Date.now() + GRACE_MS; Date.now() < end; ) {
      if (update().size === 0) return;
      Bun.sleepSync(POLL_MS);
    }
    pause();
  } finally {
    // Also when the processes can't be listed, so that none stays paused.
    signal(known, "SIGKILL");
    const left = [...known].filter((pid) => cannotSignal.has(pid));
    if (left.length > 0) {
      core.warning(
        `Processes of another user could not be stopped: ${left.join(", ")}`,
      );
    }
  }
}

/**
 * Stops the session, cleans up and exits when the run is cancelled or times out. The
 * steps are synchronous, and each runs whether or not the ones before it failed. Once
 * isFinishing returns true, only the runner's second signal does this.
 */
export function onCancel(
  steps: (() => void)[],
  isFinishing: () => boolean = () => false,
): void {
  let cancelled = false;
  const cancel = (name: NodeJS.Signals) => {
    if (cancelled || (name === "SIGINT" && isFinishing())) return;
    cancelled = true;
    for (const step of [stopDescendants, ...steps]) {
      try {
        step();
      } catch (error) {
        // A message could hold anything, such as a value that was being written.
        const { code, name } = error as { code?: string; name?: string };
        console.error(`Error cleaning up the cancelled run (${code ?? name})`);
      }
    }
    process.exit(130);
  };
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  process.on("SIGBREAK", cancel); // The runner's second signal on Windows
}
