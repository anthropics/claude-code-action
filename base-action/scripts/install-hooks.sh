#!/bin/sh

# Install git hooks
echo "Installing git hooks..."

# Make sure hooks directory exists
mkdir -p .git/hooks

# Install pre-push hook
cp scripts/pre-push .git/hooks/pre-push
chmod +x .git/hooks/pre-push

echo "Git hooks installed successfully!"