---
description: Analyze and fix CI failures by examining logs and making targeted fixes
allowed_tools: Edit,MultiEdit,Write,Read,Glob,Grep,LS,Bash(git:*),Bash(bun:*),Bash(npm:*),Bash(npx:*),Bash(gh:*)
---

# Fix CI Failures

You are tasked with analyzing CI failure logs and fixing the issues. Follow these steps:

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

## Step 1: Analyze the Failure

Parse the provided CI failure information to understand:

- Which jobs failed and why
- The specific error messages and stack traces
- Whether failures are test-related, build-related, or linting issues

## Step 2: Search and Understand the Codebase

Use search tools to locate the failing code:

- Search for the failing test names or functions
- Find the source files mentioned in error messages
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

Run available verification commands:

- Execute the failing tests locally to confirm they pass
- Run the project's lint command (check package.json for scripts)
- Run type checking if available
- Execute any build commands to ensure compilation succeeds

## Step 5: Commit and Push Changes

After applying ALL fixes:

1. Stage all modified files with `git add -A`
2. Commit with: `git commit -m "Fix CI failures: [describe specific fixes]"`
3. Document which CI jobs/tests were addressed
4. **CRITICAL**: Push the branch with `git push origin HEAD` - You MUST push the branch after committing

## Step 6: Create PR Comment (REQUIRED - DO NOT SKIP)

**CRITICAL: You MUST create a PR comment after pushing. This step is MANDATORY.**

After successfully pushing the fixes, you MUST create a comment on the original PR to notify about the auto-fix. DO NOT end the task without completing this step.

1. Extract the PR number from the context provided in arguments (look for "PR Number:" in the context)
2. **MANDATORY**: Execute the gh CLI command below to create the comment
3. Verify the comment was created successfully

**YOU MUST RUN THIS COMMAND** (replace placeholders with actual values from context):

```bash
gh pr comment PR_NUMBER --body "## 🤖 CI Auto-Fix Available

Claude has analyzed the CI failures and prepared fixes.

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
2. ✅ Committed the changes
3. ✅ Pushed the branch with `git push origin HEAD`
4. ✅ **CREATED THE PR COMMENT using `gh pr comment` command from Step 6**

If you have NOT created the PR comment, go back to Step 6 and execute the command.

## Important Guidelines

- Focus exclusively on fixing the reported CI failures
- Maintain code quality and follow the project's established patterns
- If a fix requires significant refactoring, document why it's necessary
- When multiple solutions exist, choose the simplest one that maintains code quality
- **THE TASK IS NOT COMPLETE WITHOUT THE PR COMMENT**

Begin by analyzing the failure details provided above.
