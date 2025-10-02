## Setup Guide

### Requirements

- GitLab project access token with `api` scope
- Anthropic API key (`sk-ant-...`)
- Merge request pipeline (`CI_PIPELINE_SOURCE == "merge_request_event"`)

### CI Variables

Add the following environment variables in your GitLab project or group:

- `GITLAB_BASE_URL` – e.g. `https://gitlab.com`
- `GITLAB_PROJECT_ID` – numeric project ID or URL-encoded `namespace/project`
- `GITLAB_ACCESS_TOKEN` – project access token with required permissions
- `ANTHROPIC_API_KEY` – Claude API key
- Optional tuning:
  - `CLAUDE_MODEL`
  - `CLAUDE_MAX_TOKENS`
  - `CLAUDE_TEMPERATURE`

### Pipeline Stage

Create a job that runs the entrypoint with Node.js 18 or newer.

```yaml
claude_review:
  stage: review
  image: node:22
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - npm ci
    - npx tsx src/entrypoints/gitlab-review.ts
```

