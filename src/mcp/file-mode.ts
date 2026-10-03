import { constants } from "fs";
import { lstat } from "fs/promises";

/**
 * Gets the appropriate Git file mode for a file.
 * Returns:
 * - "120000" for symbolic links
 * - "100755" for executable files
 * - "040000" for directories
 * - "100644" for regular files and other types
 *
 * @param filePath - Path to the file to check
 * @returns Git file mode string
 */
export async function getFileMode(filePath: string): Promise<string> {
  try {
    const fileStat = await lstat(filePath);
    if (fileStat.isSymbolicLink()) {
      return "120000"; // Symbolic link
    } else if (fileStat.isFile()) {
      // Check if execute bit is set for user
      if (fileStat.mode & constants.S_IXUSR) {
        return "100755"; // Executable file
      } else {
        return "100644"; // Regular file
      }
    } else if (fileStat.isDirectory()) {
      return "040000"; // Directory (tree)
    } else {
      // Fallback for unknown file types
      return "100644";
    }
  } catch (error) {
    // If we can't stat the file, default to regular file
    console.warn(
      `Could not determine file mode for ${filePath}, using default: ${error}`,
    );
    return "100644";
  }
}
