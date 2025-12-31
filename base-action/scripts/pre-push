#!/bin/sh

# Check if files need formatting before push
echo "Checking code formatting..."

# First check if any files need formatting
if ! bun run format:check; then
    echo "Code formatting errors found. Running formatter..."
    bun run format

    # Check if there are any staged changes after formatting
    if git diff --name-only --exit-code; then
        echo "All files are now properly formatted."
    else
        echo ""
        echo "ERROR: Code has been formatted but changes need to be committed!"
        echo "Please commit the formatted files and try again."
        echo ""
        echo "The following files were modified:"
        git diff --name-only
        echo ""
        exit 1
    fi
else
    echo "Code formatting is already correct."
fi

# Run type checking
echo "Running type checking..."
if ! bun run typecheck; then
    echo "Type checking failed. Please fix the type errors and try again."
    exit 1
else
    echo "Type checking passed."
fi

# Run tests
echo "Running tests..."
if ! bun run test; then
    echo "Tests failed. Please fix the failing tests and try again."
    exit 1
else
    echo "All tests passed."
fi

exit 0