import { realpath } from "fs/promises";
import { resolve, sep } from "path";

/**
 * Validates that a file path resolves within the repository root.
 * Prevents path traversal attacks via "../" sequences and symlinks.
 * @param filePath - The file path to validate (can be relative or absolute)
 * @param repoRoot - The repository root directory
 * @returns The resolved absolute path (with symlinks resolved) if valid
 * @throws Error if the path resolves outside the repository root
 */
export async function validatePathWithinRepo(
  filePath: string,
  repoRoot: string,
): Promise<string> {
  // First resolve the path string (handles .. and . segments)
  const initialPath = resolve(repoRoot, filePath);

  // Resolve symlinks to get the real path
  // This prevents symlink attacks where a link inside the repo points outside
  let resolvedRoot: string;
  let resolvedPath: string;

  try {
    resolvedRoot = await realpath(repoRoot);
  } catch {
    throw new Error(`Repository root '${repoRoot}' does not exist`);
  }

  try {
    resolvedPath = await realpath(initialPath);
  } catch {
    // File doesn't exist yet - walk up to find the closest existing ancestor directory
    // This handles the case where we're creating a new file in existing or nested non-existent directories
    let currentDir = resolve(initialPath, "..");
    while (true) {
      let resolvedAncestor: string | null = null;
      try {
        resolvedAncestor = await realpath(currentDir);
      } catch {
        // Ancestor directory does not exist yet; move up to parent
        const parentDir = resolve(currentDir, "..");
        if (parentDir === currentDir) {
          // Reached filesystem root without finding an existing ancestor
          break;
        }
        currentDir = parentDir;
        continue;
      }

      if (
        resolvedAncestor !== resolvedRoot &&
        !resolvedAncestor.startsWith(resolvedRoot + sep)
      ) {
        throw new Error(
          `Path '${filePath}' resolves outside the repository root`,
        );
      }
      // Ancestor is valid and within repo root; return initialPath since file doesn't exist yet
      return initialPath;
    }

    throw new Error(`Path '${filePath}' resolves outside the repository root`);
  }

  // Path must be within repo root (or be the root itself)
  if (
    resolvedPath !== resolvedRoot &&
    !resolvedPath.startsWith(resolvedRoot + sep)
  ) {
    throw new Error(`Path '${filePath}' resolves outside the repository root`);
  }

  return resolvedPath;
}
