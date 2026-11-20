import { execFile } from "child_process";
import { stat } from "fs/promises";
import { constants } from "fs";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Get the appropriate Git file mode for a file
export async function getFileMode(
  filePath: string,
  repoDir: string,
  platform: NodeJS.Platform = process.platform,
): Promise<string> {
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isFile()) {
      // Windows filesystem permissions cannot represent Git's executable bit.
      // Preserve the index mode for tracked files instead of clearing that bit.
      if (platform === "win32") {
        const { stdout } = await execFileAsync(
          "git",
          ["--literal-pathspecs", "ls-files", "--stage", "-z", "--", filePath],
          { cwd: repoDir, encoding: "utf8" },
        ).catch(() => ({ stdout: "" }));
        const indexMode = stdout.match(/^(100644|100755) [0-9a-f]+ 0\t/)?.[1];
        if (indexMode) return indexMode;
      }

      // Check if execute bit is set for user
      if (fileStat.mode & constants.S_IXUSR) {
        return "100755"; // Executable file
      } else {
        return "100644"; // Regular file
      }
    } else if (fileStat.isDirectory()) {
      return "040000"; // Directory (tree)
    } else if (fileStat.isSymbolicLink()) {
      return "120000"; // Symbolic link
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
