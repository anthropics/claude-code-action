import { z } from "zod";

/** Raw shape passed to `server.tool` for commit_files. */
export const commitFilesInputSchema = {
  files: z
    .array(z.string())
    .describe(
      'Array of file paths relative to repository root (e.g. ["src/main.js", "README.md"]). All files must exist locally.',
    ),
  message: z.string().describe("Commit message"),
};

/** Raw shape passed to `server.tool` for delete_files. */
export const deleteFilesInputSchema = {
  paths: z
    .array(z.string())
    .describe(
      'Array of file paths to delete relative to repository root (e.g. ["src/old-file.js", "docs/deprecated.md"])',
    ),
  message: z.string().describe("Commit message"),
};

export const commitFilesPayloadSchema = z.object(commitFilesInputSchema);
export const deleteFilesPayloadSchema = z.object(deleteFilesInputSchema);
