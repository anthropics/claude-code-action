# Batching Inline Comments

When reviewing pull requests, you often need to post multiple inline comments on different lines or files. Instead of making separate API calls for each comment, use the batch tool `create_inline_comments_batch` to post all comments in a single API call. This is more efficient, faster, and reduces GitHub API rate limit usage.

## When to Use

- **Posting 2+ inline comments** - Use batch tool for efficiency
- **Posting 1 inline comment** - Use single comment tool
- **Including a summary comment** - Batch tool supports both inline comments and review summary in one call
- **Automated PR reviews** - Perfect for workflows that review multiple files

---

## Tool Names

- **Single comment**: `mcp__github_inline_comment__create_inline_comment`
- **Batch comments**: `mcp__github_inline_comment__create_inline_comments_batch`

---

## Features

- ✅ Post multiple inline comments in a single API call
- ✅ Optionally include a review summary comment in the same call
- ✅ More efficient than multiple separate API calls
- ✅ Reduces GitHub API rate limit usage
- ✅ Faster execution time

---

## Basic Usage

### Simple Batch Example

```yaml
name: PR Review with Batch Comments

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v5

      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            Review this PR and post all inline comments together.
            Use the batch tool to post all comments in a single API call.

          claude_args: |
            --allowedTools "mcp__github_inline_comment__create_inline_comments_batch,Read,Grep"
```

**Key Configuration:**

- Include `mcp__github_inline_comment__create_inline_comments_batch` in `allowedTools`
- Prompt should mention "post all comments together" or "use batch tool"
- Works with any PR review workflow

**Expected Output:** All inline comments appear in a single review, posted efficiently in one API call.

---

## Advanced Examples

### Example 1: Explicit Batch Instruction

```yaml
prompt: |
  Review this PR and provide inline comments for all issues you find.

  IMPORTANT: When posting multiple inline comments, use the 
  `mcp__github_inline_comment__create_inline_comments_batch` tool to post 
  them all in a single API call. Only use the single comment tool if you're 
  posting just one comment.

claude_args: |
  --allowedTools "mcp__github_inline_comment__create_inline_comments_batch,mcp__github_inline_comment__create_inline_comment"
```

### Example 2: With Review Summary Comment

You can include both inline comments AND a summary comment in a single API call:

```yaml
prompt: |
  Review this PR and provide inline comments for all issues you find.
  
  IMPORTANT: Use create_inline_comments_batch to post all comments together.
  Also include a summary comment highlighting the most critical issues.
  
  The batch tool supports both inline comments and a review summary in one call.

claude_args: |
  --allowedTools "mcp__github_inline_comment__create_inline_comments_batch"
```

**Benefits:**

- All inline comments (on specific lines)
- A summary comment (top-level review comment)
- All in a single API call!

### Example 3: Comprehensive Code Review

```yaml
prompt: |
  Perform a thorough code review of this PR. For each issue you find:

  1. Identify the file path and line number
  2. Write a clear, actionable comment
  3. Collect all comments and post them together using 
     `create_inline_comments_batch` in a single call

  Review checklist:
  - [ ] Code quality and best practices
  - [ ] Security vulnerabilities  
  - [ ] Performance issues
  - [ ] Error handling
  - [ ] Documentation

  After reviewing, batch all inline comments together for efficiency.

claude_args: |
  --allowedTools "mcp__github_inline_comment__create_inline_comments_batch,mcp__github_inline_comment__create_inline_comment,Bash(gh pr view:*),Bash(gh pr diff:*)"
```

---

## Comment Object Structure

Each comment in the batch array should have:

```typescript
{
  path: string,              // File path (e.g., "src/index.js")
  body: string,              // Comment text (supports markdown)
  line?: number,             // Line number for single-line comments
  startLine?: number,        // Start line for multi-line comments
  side?: "LEFT" | "RIGHT"    // Default: "RIGHT"
}
```

### Single-Line Comment Example

```json
{
  "path": "src/utils.ts",
  "line": 42,
  "body": "Consider extracting this into a helper function for reusability"
}
```

### Multi-Line Comment Example

```json
{
  "path": "src/api.ts",
  "startLine": 10,
  "line": 15,
  "body": "This entire block could be simplified using async/await"
}
```

### Code Suggestion Example

```json
{
  "path": "src/validator.ts",
  "line": 28,
  "body": "```suggestion\nif (!value || value.trim() === '') {\n  throw new Error('Value cannot be empty');\n}\n```"
}
```

---

## Complete Workflow Example

```yaml
name: PR Review with Batch Comments

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v5

      - name: Review PR with Batch Comments
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            Review this PR thoroughly. When you find multiple issues:

            1. Collect all comments with their file paths and line numbers
            2. Use `create_inline_comments_batch` to post them all at once
            3. Include a summary comment highlighting critical issues
            4. This is more efficient than multiple API calls

            Focus on:
            - Code quality and maintainability
            - Security best practices
            - Performance optimizations
            - Error handling completeness

          claude_args: |
            --allowedTools "mcp__github_inline_comment__create_inline_comments_batch,mcp__github_inline_comment__create_inline_comment,Bash(gh pr view:*),Bash(gh pr diff:*),Read,Grep"
```

---

## Best Practices

1. **Always batch when posting multiple comments** - Reduces API calls and improves performance
2. **Use single tool for one comment** - Simpler and clearer for single comments
3. **Include summary comment** - Use the `review_body` parameter for top-level feedback
4. **Group by file** - Organize comments by file path for better readability
5. **Be specific** - Include exact line numbers and clear, actionable feedback
6. **Use code suggestions** - For fixable issues, use GitHub's suggestion syntax

---

## Tool Selection Strategy

The LLM will automatically choose the right tool based on:

- **Number of comments**: Batch for 2+, single for 1
- **Tool availability**: If both are allowed, batch is preferred
- **Prompt instructions**: Explicit instructions guide the choice

---

## Troubleshooting

If the LLM isn't using the batch tool:

1. **Be explicit**: Mention "use batch tool" or "post all comments together"
2. **Show format**: Provide an example of the array structure
3. **Emphasize efficiency**: Explain why batching is better
4. **Check tools**: Ensure `create_inline_comments_batch` is in `allowedTools`
