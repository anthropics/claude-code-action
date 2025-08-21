---
description: Analyze and fix CI failures with signed commits using MCP tools
allowed_tools: Edit,MultiEdit,Write,Read,Glob,Grep,LS,Bash(bun:*),Bash(npm:*),Bash(npx:*),Bash(gh:*),mcp__github_file_ops__commit_files,mcp__github_file_ops__delete_files
---

# Fix CI Failures with Signed Commits

You are tasked with analyzing CI failure logs and fixing the issues using MCP tools for signed commits. Follow these steps:

## Context Provided

$ARGUMENTS

## Important Context Information

Look for these key pieces of information in the arguments:

- **Failed CI Run URL**: Link to the failed CI run
- **Failed Jobs**: List of jobs that failed
- **PR Number**: The PR number to comment on
- **Branch Name**: The fix branch you're working on
- **Base Branch**: The original PR branch
- **Error logs**: Detailed logs from failed jobs

## CRITICAL: Use MCP Tools for Git Operations

**IMPORTANT**: You MUST use MCP tools for all git operations to ensure commits are properly signed. DO NOT use `git` commands directly via Bash.

- Use `mcp__github_file_ops__commit_files` to commit and push changes
- Use `mcp__github_file_ops__delete_files` to delete files

## Step 1: Analyze the Failure

Parse the provided CI failure information to understand:

- Which jobs failed and why
- The specific error messages and stack traces
- Whether failures are test-related, build-related, or linting issues

## Step 2: Search and Understand the Codebase

Use MCP search tools to locate the failing code:

- Use `mcp_github_file_ops_server__search_files` or `mcp_github_file_ops_server__file_search` to find failing test names or functions
- Use `mcp_github_file_ops_server__read_file` to read source files mentioned in error messages
- Review related configuration files (package.json, tsconfig.json, etc.)

## Step 3: Apply Targeted Fixes

Make minimal, focused changes:

- **For test failures**: Determine if the test or implementation needs fixing
- **For type errors**: Fix type definitions or correct the code logic
- **For linting issues**: Apply formatting using the project's tools
- **For build errors**: Resolve dependency or configuration issues
- **For missing imports**: Add the necessary imports or install packages

Requirements:

- Only fix the actual CI failures, avoid unrelated changes
- Follow existing code patterns and conventions
- Ensure changes are production-ready, not temporary hacks
- Preserve existing functionality while fixing issues

## Step 4: Verify Fixes Locally

Run available verification commands using Bash:

- Execute the failing tests locally to confirm they pass
- Run the project's lint command (check package.json for scripts)
- Run type checking if available
- Execute any build commands to ensure compilation succeeds

## Step 5: Commit and Push Changes Using MCP

**CRITICAL**: You MUST use MCP tools for committing and pushing:

1. Prepare all your file changes (using Edit/MultiEdit/Write tools as needed)
2. **Use `mcp__github_file_ops__commit_files` to commit and push all changes**
   - Pass the file paths you've edited in the `files` array
   - Set `message` to describe the specific fixes (e.g., "Fix CI failures: remove syntax errors and format code")
   - The MCP tool will automatically create the branch specified in "Branch Name:" from the context and push signed commits

**IMPORTANT**: The MCP tool will create the branch from the context automatically. The branch name from "Branch Name:" in the context will be used.

Example usage:

```
mcp__github_file_ops__commit_files with:
- files: ["src/utils/retry.ts", "src/other/file.ts"]  // List of file paths you edited
- message: "Fix CI failures: [describe specific fixes]"
```

Note: The branch will be created from the Base Branch specified in the context.

## Step 6: Create PR Comment (REQUIRED - DO NOT SKIP)

**CRITICAL: You MUST create a PR comment after pushing. This step is MANDATORY.**

After successfully pushing the fixes, you MUST create a comment on the original PR to notify about the auto-fix. DO NOT end the task without completing this step.

1. Extract the PR number from the context provided in arguments (look for "PR Number:" in the context)
2. **MANDATORY**: Execute the gh CLI command below to create the comment
3. Verify the comment was created successfully

**YOU MUST RUN THIS COMMAND** (replace placeholders with actual values from context):

```bash
gh pr comment PR_NUMBER --body "## 🤖 CI Auto-Fix Available (Signed Commits)

Claude has analyzed the CI failures and prepared fixes with signed commits.

[**→ Create pull request to fix CI**](https://github.com/OWNER/REPO/compare/BASE_BRANCH...FIX_BRANCH?quick_pull=1)

_This fix was generated automatically based on the [failed CI run](FAILED_CI_RUN_URL)._"
```

**IMPORTANT REPLACEMENTS YOU MUST MAKE:**

- Replace `PR_NUMBER` with the actual PR number from "PR Number:" in context
- Replace `OWNER/REPO` with the repository from "Repository:" in context
- Replace `BASE_BRANCH` with the branch from "Base Branch:" in context
- Replace `FIX_BRANCH` with the branch from "Branch Name:" in context
- Replace `FAILED_CI_RUN_URL` with the URL from "Failed CI Run:" in context

**DO NOT SKIP THIS STEP. The task is NOT complete until the PR comment is created.**

## Step 7: Final Verification

**BEFORE CONSIDERING THE TASK COMPLETE**, verify you have:

1. ✅ Fixed all CI failures
2. ✅ Committed the changes using `mcp_github_file_ops_server__push_files`
3. ✅ Verified the branch was pushed successfully
4. ✅ **CREATED THE PR COMMENT using `gh pr comment` command from Step 6**

If you have NOT created the PR comment, go back to Step 6 and execute the command.

## Important Guidelines

- Always use MCP tools for git operations to ensure proper commit signing
- Focus exclusively on fixing the reported CI failures
- Maintain code quality and follow the project's established patterns
- If a fix requires significant refactoring, document why it's necessary
- When multiple solutions exist, choose the simplest one that maintains code quality
- **THE TASK IS NOT COMPLETE WITHOUT THE PR COMMENT**

Begin by analyzing the failure details provided above.
