## Usage

### Running Locally

Set required environment variables and invoke the entrypoint:

```bash
npm install
export GITLAB_BASE_URL=https://gitlab.com
export GITLAB_PROJECT_ID=namespace/project
export GITLAB_ACCESS_TOKEN=glpat-...
export CI_MERGE_REQUEST_IID=42
export ANTHROPIC_API_KEY=sk-ant-...

npx tsx src/entrypoints/gitlab-review.ts
```

### Pipeline Integration

1. Configure CI variables
2. Add the job from `docs/setup.md`
3. Verify the job posts a summary note and inline comments on the merge request

### Expected Output

- A system note summarizing the review findings and risks
- Inline discussion comments for each actionable finding with line numbers
- Logs in the CI job showing prompt generation and API calls (debug level optional)

