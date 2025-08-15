export function parseAllowedTools(claudeArgs: string): string[] {
  // Match --allowedTools followed by the value
  // Handle both quoted and unquoted values
  const patterns = [
    /--allowedTools\s+"([^"]+)"/, // Double quoted
    /--allowedTools\s+'([^']+)'/, // Single quoted
    /--allowedTools\s+([^\s]+)/, // Unquoted
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
