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
 * Normalizes an actor login for filter matching.
 *
 * GitHub GraphQL returns bot `author.login` values without the `[bot]` suffix
 * (e.g. `"github-actions"` / `"claude"` with `__typename: "Bot"`), while REST
 * and the UI use `"github-actions[bot]"`. The documented `*[bot]` wildcard and
 * specific bot patterns like `dependabot[bot]` expect the REST form, so append
 * `[bot]` when GraphQL identifies the author as a Bot.
 *
 * @param login - Actor username (GraphQL or REST form)
 * @param typename - Optional GraphQL `__typename` (`"Bot"`, `"User"`, …)
 * @returns Login suitable for matching against actor filter patterns
 */
export function normalizeActorLogin(
  login: string,
  typename?: string | null,
): string {
  if (typename === "Bot" && login && !login.endsWith("[bot]")) {
    return `${login}[bot]`;
  }
  return login;
}

/**
 * Checks if an actor matches a pattern
 * Supports wildcards: "*[bot]" matches all bots, "dependabot[bot]" matches specific
 * @param actor - Actor username to check (prefer normalizeActorLogin first for GraphQL bots)
 * @param pattern - Pattern to match against
 * @returns true if actor matches pattern
 */
export function actorMatchesPattern(actor: string, pattern: string): boolean {
  // Exact match (REST-style login, GraphQL login, or already-normalized bot login)
  if (actor === pattern) return true;

  // Wildcard bot pattern: "*[bot]" matches any username ending with [bot]
  // (including GraphQL bots after normalizeActorLogin appends the suffix)
  if (pattern === "*[bot]" && actor.endsWith("[bot]")) return true;

  // No match
  return false;
}

/**
 * Determines if a comment should be included based on actor filters
 * @param actor - Comment author username (prefer normalizeActorLogin for GraphQL bots)
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
