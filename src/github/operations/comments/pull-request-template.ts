import type { Octokits } from "../../api/client";

const TEMPLATE_PATHS = [".github/", "", "docs/"].flatMap((directory) => [
  `${directory}pull_request_template.md`,
  `${directory}PULL_REQUEST_TEMPLATE.md`,
]);

// Keep generated compare links within a conservative URL length budget.
const MAX_COMPARE_URL_LENGTH = 8192;

type TemplateBlob = {
  text: string | null;
  isBinary: boolean;
  isTruncated: boolean;
};

export type PullRequestTemplate = {
  compareUrl: string;
  body: string;
};

export async function readDefaultPullRequestTemplate(
  graphql: Octokits["graphql"],
  owner: string,
  repo: string,
): Promise<string | undefined> {
  const fields = TEMPLATE_PATHS.map(
    (path, index) =>
      `file${index}: object(expression: ${JSON.stringify(`HEAD:${path}`)}) {
        ... on Blob { text isBinary isTruncated }
      }`,
  ).join("\n");
  const { repository } = await graphql<{
    repository: Record<string, TemplateBlob | null> | null;
  }>(
    `query DefaultPullRequestTemplate($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) { ${fields} }
    }`,
    { owner, repo },
  );

  for (const index of TEMPLATE_PATHS.keys()) {
    const blob = repository?.[`file${index}`];
    const body = blob?.text?.trim();
    if (body && !blob?.isBinary && !blob?.isTruncated) return body;
  }
}

export function appendPullRequestTemplate(
  link: string,
  template: PullRequestTemplate,
): string {
  try {
    const url = new URL(link);
    const expected = new URL(template.compareUrl);
    if (
      url.origin !== expected.origin ||
      decodeURIComponent(url.pathname) !==
        decodeURIComponent(expected.pathname) ||
      url.searchParams.has("template")
    ) {
      return link;
    }

    const body = url.searchParams.get("body")?.trimEnd();
    if (body?.includes(template.body)) return link;

    url.searchParams.set(
      "body",
      [body, template.body].filter(Boolean).join("\n\n"),
    );
    return url.href.length <= MAX_COMPARE_URL_LENGTH ? url.href : link;
  } catch {
    return link;
  }
}
