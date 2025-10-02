## Claude Code for GitLab

Claude Code GitLab integration automates merge request reviews using Anthropic's
Claude models. The project provides a standalone Node.js entrypoint designed to
run inside GitLab CI pipelines using project access tokens for API operations
and Anthropic API keys for analysis.

### Key Capabilities

- Automated merge request summary and risk analysis
- Inline discussion comments for actionable findings
- Configurable model, max tokens, and temperature via CI variables
- Lightweight CLI entrypoint suitable for custom pipeline stages

### Current Limitations

- Only merge request pipelines are supported (requires `CI_MERGE_REQUEST_IID`)
- Only single-pass reviews are implemented; re-runs replace previous comments
- Inline comments require files present in the MR diff (no support for moved lines)

