/**
 * Parses actor filter string into array of patterns
 * @param filterString - Comma-separated actor names (e.g., "user1,user2,*[bot]")
 * @returns Array of actor patterns
 */
export function parseActorFilter(filterString: string): string[] {
  if (!filterString.trim()) return [];
  return filterString
    .split(",")
    .map((actor) => actor.trim())
    .filter((actor) => actor.length > 0);
}

/**
 * Resolves the name to match actor filter patterns against.
 *
 * GitHub's GraphQL API returns the bare login for App actors ("dependabot"),
 * whereas REST and the GitHub UI use a "[bot]" suffix ("dependabot[bot]"). Users
 * write filter patterns in the suffixed form, both the documented "*[bot]"
 * wildcard and exact entries like "renovate[bot]", so GraphQL bot logins are
 * normalized to that form before matching. Without this no "[bot]" pattern can
 * ever match, because the suffix is simply absent from the data.
 *
 * @param author - Comment author; null for deleted ("ghost") accounts
 * @returns Actor name, "[bot]"-suffixed for App actors
 */
export function resolveActorName(
  author: { login: string; __typename?: string } | null | undefined,
): string {
  if (!author) return "ghost";

  if (author.__typename === "Bot" && !author.login.endsWith("[bot]")) {
    return `${author.login}[bot]`;
  }

  return author.login;
}

/**
 * Checks if an actor matches a pattern
 * Supports wildcards: "*[bot]" matches all bots, "dependabot[bot]" matches specific
 * @param actor - Actor username to check
 * @param pattern - Pattern to match against
 * @returns true if actor matches pattern
 */
export function actorMatchesPattern(actor: string, pattern: string): boolean {
  // Exact match
  if (actor === pattern) return true;

  // Wildcard bot pattern: "*[bot]" matches any username ending with [bot]
  if (pattern === "*[bot]" && actor.endsWith("[bot]")) return true;

  // No match
  return false;
}

/**
 * Determines if a comment should be included based on actor filters
 * @param actor - Comment author username
 * @param includeActors - Array of actors to include (empty = include all)
 * @param excludeActors - Array of actors to exclude (empty = exclude none)
 * @returns true if comment should be included
 */
export function shouldIncludeCommentByActor(
  actor: string,
  includeActors: string[],
  excludeActors: string[],
): boolean {
  // Check exclusion first (exclusion takes priority)
  if (excludeActors.length > 0) {
    for (const pattern of excludeActors) {
      if (actorMatchesPattern(actor, pattern)) {
        return false; // Excluded
      }
    }
  }

  // Check inclusion
  if (includeActors.length > 0) {
    for (const pattern of includeActors) {
      if (actorMatchesPattern(actor, pattern)) {
        return true; // Explicitly included
      }
    }
    return false; // Not in include list
  }

  // No filters or passed all checks
  return true;
}
