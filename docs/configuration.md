## Configuration Reference

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GITLAB_BASE_URL` | Base URL of your GitLab instance | ✅ |
| `GITLAB_PROJECT_ID` | Project identifier (numeric or path) | ✅ |
| `GITLAB_ACCESS_TOKEN` | Project access token with API access | ✅ |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key | ✅ |
| `CLAUDE_MODEL` | Claude model name (default `claude-3-5-sonnet-20241022`) | Optional |
| `CLAUDE_MAX_TOKENS` | Maximum output tokens (default `4096`) | Optional |
| `CLAUDE_TEMPERATURE` | Sampling temperature (default `0`) | Optional |
| `LOG_LEVEL` | Set to `debug` for verbose logs | Optional |

### Security Notes

- Store `GITLAB_ACCESS_TOKEN` and `ANTHROPIC_API_KEY` in GitLab CI/CD variables as protected values.
- Prefer project access tokens scoped to a single project to limit blast radius.
- Rotate keys periodically and revoke unused tokens.

