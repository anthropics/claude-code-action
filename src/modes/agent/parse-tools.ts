export function parseAllowedTools(claudeArgs: string): string[] {
  // Match --allowedTools or --allowed-tools followed by the value
  // Handle both quoted and unquoted values
  const patterns = [
    /--(?:allowedTools|allowed-tools)\s+"([^"]+)"/, // Double quoted
    /--(?:allowedTools|allowed-tools)\s+'([^']+)'/, // Single quoted
    /--(?:allowedTools|allowed-tools)\s+([^\s]+)/, // Unquoted
  ];

  for (const pattern of patterns) {
    const match = claudeArgs.match(pattern);
    if (match && match[1]) {
      // Don't return if the value starts with -- (another flag)
      if (match[1].startsWith("--")) {
        return [];
      }
      return match[1].split(",").map((t) => t.trim());
    }
  }

  return [];
}
