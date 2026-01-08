export function parseAllowedTools(claudeArgs: string): string[] {
  // Match --allowedTools or --allowed-tools followed by the value
  // Handle both quoted and unquoted values
  // Use /g flag to find ALL occurrences, not just the first one
  const patterns = [
    /--(?:allowedTools|allowed-tools)\s+"([^"]+)"/g, // Double quoted
    /--(?:allowedTools|allowed-tools)\s+'([^']+)'/g, // Single quoted
    /--(?:allowedTools|allowed-tools)\s+([^'"\s][^\s]*)/g, // Unquoted (must not start with quote)
  ];

  const tools: string[] = [];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    for (const match of claudeArgs.matchAll(pattern)) {
      if (match[1]) {
        // Don't add if the value starts with -- (another flag)
        if (match[1].startsWith("--")) {
          continue;
        }
        for (const tool of match[1].split(",")) {
          const trimmed = tool.trim();
          if (trimmed && !seen.has(trimmed)) {
            seen.add(trimmed);
            tools.push(trimmed);
          }
        }
      }
    }
  }

  return tools;
}
