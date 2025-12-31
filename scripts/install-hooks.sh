#!/bin/sh

# Install git hooks
echo "Installing git hooks..."

# Make sure hooks directory exists
mkdir -p .git/hooks

# Install pre-commit hook
cp scripts/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

echo "Git hooks installed successfully!"