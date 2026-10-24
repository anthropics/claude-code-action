/**
 * The checkout this action operates on.
 *
 * Actions points GITHUB_WORKSPACE at the directory `actions/checkout` writes
 * into, and the rest of the action already locates the repository that way: the
 * MCP file-ops server is handed `GITHUB_WORKSPACE || cwd` as its REPO_DIR
 * (see install-mcp-server.ts), and the CLI's permission model scopes edits to
 * $GITHUB_WORKSPACE. The git calls in this directory instead inherited whatever
 * working directory the composite step happened to run in, so a run where the
 * two differ sends git looking outside the checkout — it exits 128 with
 * "not a git repository" and takes the job down with it.
 *
 * Falls back to the process working directory so local runs and the unit tests,
 * which have no GITHUB_WORKSPACE, keep behaving as before.
 */
export function repositoryDir(): string {
  return process.env.GITHUB_WORKSPACE || process.cwd();
}
