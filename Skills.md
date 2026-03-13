# Skills

## Agent Overview

Claude Code Action is a GitHub Action agent that integrates Claude directly into GitHub workflows. It operates in two modes: **tag mode**, where developers mention `@claude` in issue and PR comments to request code changes, reviews, or answers; and **agent mode**, where it runs automated tasks via a configured prompt input on events like `pull_request`, `issues`, or `schedule`. The agent specializes in code implementation, pull request review with inline comments, issue triage, CI/CD failure analysis, and repository automation.

## Core Capabilities

- **Code generation and implementation** — Writes, edits, and creates files in response to issue or PR requests, then commits and pushes changes to the appropriate branch.
- **Pull request review** — Analyzes diffs, posts inline review comments on specific code lines, and provides actionable feedback with optional "Fix this" links.
- **Issue triage and labeling** — Reads issue context and applies labels, categorizes issues, and detects duplicates.
- **CI/CD failure analysis** — Downloads workflow run logs, interprets failures, and suggests or applies fixes.
- **Progress tracking** — Maintains a live-updating GitHub comment with task checklists and status indicators.
- **Branch and commit management** — Creates branches for issues, pushes to existing PR branches, and supports commit signing via SSH keys or the GitHub API.
- **Structured output** — Generates validated JSON output via schema flags for downstream automation workflows.
- **Context-aware responses** — Ingests full PR/issue metadata, comment history, review threads, changed file diffs, and CI status before responding.

## Programming Languages

- **TypeScript** — Primary language of this project; full debugging, refactoring, and implementation support.
- **JavaScript** — Frontend and Node.js/Bun development.
- **Python** — Scripting, API development, MCP server authoring.
- **Go** — Backend services and CLI tools.
- **Rust** — Systems programming and performance-critical code.
- **Java / Kotlin** — Enterprise and Android development.
- **C / C++** — Systems-level code and embedded applications.
- **Ruby, PHP, Swift, Shell** — General development and scripting across ecosystems.

## Framework & Ecosystem Knowledge

- **Bun** — Runtime and test runner used by this project.
- **GitHub Actions** — Workflow authoring, event handling, input/output management, step summaries.
- **Octokit** — REST and GraphQL clients for the GitHub API.
- **Model Context Protocol (MCP)** — Custom tool servers for GitHub comments, file operations, CI status, and inline reviews.
- **Zod** — Schema validation for inputs and structured outputs.
- **React / Next.js** — Frontend component development.
- **Express / FastAPI / Django** — Backend API frameworks.
- **Docker / Kubernetes** — Containerization and orchestration.
- **Tailwind CSS** — Utility-first styling.
- **AWS Bedrock / Google Vertex AI / Azure Foundry** — Cloud AI provider integrations.

## Codebase Navigation Skills

- **File discovery** — Uses `Glob` and `LS` tools to locate files by pattern across any repository size.
- **Content search** — Uses `Grep` with regex support to find definitions, references, and patterns across the codebase.
- **Diff analysis** — Reads PR diffs with file-level SHAs and line-by-line changes to understand what was modified.
- **Dependency tracing** — Follows import chains and function call paths to understand how components connect.
- **Architecture recognition** — Identifies project structure patterns, module boundaries, and configuration conventions.
- **CI log interpretation** — Downloads and parses GitHub Actions job logs to locate failures and their root causes.

## Refactoring Skills

- **Reducing duplication** — Identifies repeated patterns and extracts shared utilities or components.
- **Improving readability** — Renames variables, simplifies control flow, and restructures code for clarity.
- **Extracting reusable components** — Breaks monolithic functions into composable, testable units.
- **Optimizing performance** — Identifies unnecessary computation, redundant API calls, and inefficient data structures.
- **Modernizing patterns** — Updates legacy code to use current language features and framework idioms.
- **Type safety improvements** — Strengthens TypeScript types, adds discriminated unions, and removes unsafe casts.

## Testing Skills

- **Unit test creation** — Writes focused tests using the project's test framework (Bun test runner in this project).
- **Integration test design** — Structures tests that verify interactions between modules and external services.
- **Test coverage improvement** — Identifies untested code paths and adds cases for edge conditions.
- **Mocking dependencies** — Creates mocks for GitHub API responses, file system operations, and external services.
- **Test-driven debugging** — Writes failing tests to reproduce bugs before implementing fixes.

## DevOps & Tooling Knowledge

- **Git workflows** — Branch creation, commit authoring with co-author trailers, push operations, and commit signing (SSH and API-based).
- **GitHub Actions CI/CD** — Workflow configuration, event triggers, step dependencies, secrets management, and output handling.
- **Docker** — Container builds, multi-stage configurations, and runtime environments.
- **Package managers** — Bun, npm, pip, and their lockfile management.
- **Infrastructure-as-code** — Terraform, CloudFormation, and deployment configuration.
- **Cloud provider authentication** — OIDC token exchange for AWS, GCP, and Azure.

## Debugging Skills

- **Log analysis** — Downloads and parses CI/CD job logs to pinpoint failure locations and error messages.
- **Stack trace interpretation** — Reads error traces across languages to identify root causes and affected call chains.
- **Diff-based debugging** — Correlates code changes with test failures or runtime errors.
- **Hypothesis-driven investigation** — Searches for patterns, checks assumptions against code, and narrows down causes systematically.
- **Context reconstruction** — Gathers PR metadata, comment history, and review threads to understand the full picture before diagnosing issues.

## Documentation Skills

- **README generation** — Creates clear project overviews with setup instructions and usage examples.
- **API documentation** — Documents endpoints, parameters, return types, and error responses.
- **Inline code comments** — Adds explanatory comments where logic is non-obvious.
- **Architecture explanations** — Describes system design, data flow, and component relationships.
- **Migration guides** — Documents breaking changes and provides upgrade paths between versions.

## Workflow Approach

1. **Understand the problem** — Reads the issue, PR, or comment to fully grasp the request and its context.
2. **Gather context** — Inspects relevant files, diffs, CI logs, and comment history.
3. **Plan the approach** — Determines what changes are needed and which files to modify.
4. **Implement changes** — Edits or creates files, keeping modifications focused and minimal.
5. **Commit and push** — Stages changes, creates descriptive commits, and pushes to the appropriate branch.
6. **Communicate results** — Updates the tracking comment with progress, results, and any follow-up actions.

## Collaboration Style

- **Step-by-step transparency** — Updates a live tracking comment with checkbox progress as tasks complete.
- **Respects project conventions** — Follows existing code style, naming patterns, and architectural decisions.
- **Minimal changes** — Avoids unnecessary refactoring, feature additions, or modifications beyond what was requested.
- **Suggests alternatives** — Proposes different approaches when the requested solution has trade-offs.
- **Co-authored commits** — Credits the requesting developer as a co-author on generated commits.
- **Context-aware responses** — Tailors answers based on whether the context is a PR review, an issue request, or a CI failure.

## Safety & Limitations

- **Permission-gated access** — Only users with write access to the repository can trigger the agent; bots are disabled by default.
- **No destructive operations without confirmation** — Does not force-push, delete branches, or perform hard resets without explicit instruction.
- **Input sanitization** — Strips HTML comments, invisible characters, and potential injection vectors from all inputs.
- **Tool restrictions** — `WebSearch` and `WebFetch` are disabled by default; only explicitly allowed tools are available.
- **Token lifecycle management** — GitHub App tokens are short-lived and automatically revoked after execution.
- **Single-repository scope** — Cannot span multiple repositories in one session.
- **Cannot submit formal PR reviews** — Posts comments and inline feedback but cannot approve or request changes via GitHub's review system.
- **Cannot merge branches** — Pushes code but does not merge pull requests.
- **Secrets protection** — Never exposes API keys or tokens in comments or logs; full output mode carries explicit warnings.
