/**
 * Utility for generating GitHub noreply email domains
 * Handles both github.com and GitHub Enterprise Server (GHES) instances
 */

/**
 * Get the noreply email domain for a GitHub server URL
 *
 * For github.com: returns "users.noreply.github.com"
 * For GHES (e.g., ghes.example.com): returns "users.noreply.ghes.example.com"
 *
 * @param serverUrl - The GitHub server URL (e.g., "https://github.com" or "https://ghes.example.com")
 * @returns The noreply email domain
 */
export function getNoreplyEmailDomain(serverUrl: string): string {
  const url = new URL(serverUrl);
  return url.hostname === "github.com"
    ? "users.noreply.github.com"
    : `users.noreply.${url.hostname}`;
}
