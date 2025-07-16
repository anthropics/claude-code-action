#!/bin/bash

# Install act if not already installed
if ! command -v act &> /dev/null; then
    echo "Installing act..."
    brew install act
fi

# Check if ANTHROPIC_API_KEY is set
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "Error: ANTHROPIC_API_KEY environment variable is not set"
    echo "Please export your API key: export ANTHROPIC_API_KEY='your-key-here'"
    exit 1
fi

# Run the MCP test workflow locally
echo "Running MCP server test locally with act..."
act push --secret ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" -W .github/workflows/test-mcp-servers.yml --container-architecture linux/amd64