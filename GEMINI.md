# GEMINI.md

This file provides guidance to Gemini CLI when working with code in this repository.

## Development Tools

- Runtime: Bun 1.2.11

## Common Development Tasks

### Available npm/bun scripts from package.json:

```bash
# Test
bun test

# Formatting
bun run format          # Format code with prettier
bun run format:check    # Check code formatting

# Type checking
bun run typecheck       # Check TypeScript types
```

## Architecture Overview

This is a GitHub Action that enables Gemini to interact with GitHub PRs and issues. The action:

1. **Trigger Detection**: Uses `check-trigger.ts` to determine if Gemini should respond based on comment/issue content
2. **Context Gathering**: Fetches GitHub data (PRs, issues, comments) via `github-data-fetcher.ts` and formats it using `github-data-formatter.ts`
3. **AI Integration**: Supports multiple Gemini providers (Direct Gemini API, Google Vertex AI)
4. **Prompt Creation**: Generates context-rich prompts using `create-prompt.ts`
5. **MCP Server Integration**: Installs and configures GitHub MCP server for extended functionality

### Key Components

- **Trigger System**: Responds to `@gemini` comments or issue assignments
- **Authentication**: OIDC-based token exchange for secure GitHub interactions
- **Cloud Integration**: Supports direct Gemini API and Google Vertex AI
- **GitHub Operations**: Creates branches, posts comments, and manages PRs/issues

### Project Structure

```
src/
├── entrypoints/
│   ├── prepare.ts           # Validates inputs and sets up environment
│   └── execute-gemini.ts    # Executes Gemini CLI with prepared context
├── create-prompt/
│   ├── index.ts            # Generates contextual prompts
│   └── types.ts            # TypeScript types for prompt context
├── github/
│   ├── data-fetcher.ts     # Retrieves GitHub data
│   ├── data-formatter.ts   # Formats GitHub data for prompts
│   └── check-trigger.ts    # Determines if Gemini should respond
├── mcp/
│   ├── install-mcp-server.ts      # Sets up GitHub MCP server
│   └── github-file-ops-server.ts  # MCP server implementation
├── validation/
│   └── index.ts            # Input validation and security checks
└── utils/
    └── index.ts            # Utility functions
```

## Important Notes

- Actions are triggered by `@gemini` comments or issue assignment unless a different trigger_phrase is specified
- The action creates branches for issues and pushes to PR branches directly
- All actions create OIDC tokens for secure authentication
- Progress is tracked through dynamic comment updates with checkboxes