export class GitLabError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "GitLabError";
  }
}

export function assertResponseOk(response: Response, context: string) {
  if (!response.ok) {
    throw new GitLabError(
      `${context} failed with status ${response.status}: ${response.statusText}`,
      response.status,
    );
  }
}

