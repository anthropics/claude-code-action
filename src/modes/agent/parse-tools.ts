export function parseAllowedTools(claudeArgs: string): string[] {
  if (!claudeArgs.trim()) {
    return [];
  }

  const args = claudeArgs.match(/(?:[^\s"]+|"[^"]*")+/g) || [];

  const tools: string[] = [];
  const seen = new Set<string>();

  let foundFlag = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (
      arg === "--allowedTools" ||
      arg === "--allowed-tools"
    ) {
      // Prevent duplicate flag abuse
      if (foundFlag) {
        throw new Error(
          "Multiple --allowedTools flags are not allowed",
        );
      }

      foundFlag = true;

      const value = args[i + 1];

      if (!value || value.startsWith("--")) {
        throw new Error(
          "--allowedTools requires a value",
        );
      }

      i++;

      const cleaned = value.replace(/^['"]|['"]$/g, "");

      const parsedTools = cleaned
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      for (const tool of parsedTools) {
        // Block wildcard permissions
        if (tool.includes("*")) {
          throw new Error(
            `Wildcard tool permissions are not allowed: ${tool}`,
          );
        }

        // Block shell metacharacters
        if (/[;&|`$<>]/.test(tool)) {
          throw new Error(
            `Invalid tool name: ${tool}`,
          );
        }

        if (!seen.has(tool)) {
          seen.add(tool);
          tools.push(tool);
        }
      }
    }
  }

  return tools;
}
