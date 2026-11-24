/**
 * Changes what the runner would take for a workflow command, so that it's only shown.
 * The runner reads `::name::` at the start of a line and `##[name]` anywhere in it.
 */
export function escapeWorkflowCommands(text: string): string {
  return (
    text
      .replaceAll("##[", "##[\\")
      // The runner skips spaces first. This skips all that isn't visible ASCII.
      .replace(/^([^\x21-\x7e\r\n]*)::/gm, "$1\\::")
  );
}

/**
 * Keeps text that is logged, such as a comment or a file name, from running workflow
 * commands. To run one, use @actions/core, which doesn't go through console.
 */
export function escapeConsoleOutput(): void {
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    const write = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      const text = args.map((arg) =>
        typeof arg === "string" ? arg : Bun.inspect(arg, { depth: 2 }),
      );
      write(escapeWorkflowCommands(text.join(" ")));
    };
  }
}
