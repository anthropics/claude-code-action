#!/bin/bash

# Install act if not already installed
if ! command -v act &> /dev/null; then
    echo "Installing act..."
    brew install act
fi

# Run the test workflow locally
# You'll need to provide your ANTHROPIC_API_KEY
echo "Running action locally with act..."
act push --secret ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" -W .github/workflows/test-base-action.yml --container-architecture linux/amd64