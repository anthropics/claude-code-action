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
    // File doesn't exist yet - fall back to checking the parent directory
    // This handles the case where we're creating a new file
    const parentDir = resolve(initialPath, "..");
    try {
      const resolvedParent = await realpath(parentDir);
      if (
        resolvedParent !== resolvedRoot &&
        !resolvedParent.startsWith(resolvedRoot + sep)
      ) {
        throw new Error(
          `Path '${filePath}' resolves outside the repository root`,
        );
      }
      // Parent is valid, return the initial path since file doesn't exist yet
      return initialPath;
    } catch {
      throw new Error(
        `Path '${filePath}' resolves outside the repository root`,
      );
    }
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
