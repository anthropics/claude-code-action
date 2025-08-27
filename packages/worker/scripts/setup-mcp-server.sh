#!/bin/bash
# Setup MCP server for Claude Code
# This script is called during worker initialization

echo "Setting up MCP Process Manager..."

# Setup MCP server configuration for Claude Code
if [ -f "/app/packages/worker/mcp-config.json" ]; then
    mkdir -p /home/claude/.claude
    cp /app/packages/worker/mcp-config.json /home/claude/.claude/settings.mcp.json
    echo "✅ MCP server configuration deployed to /home/claude/.claude/settings.mcp.json"
    
    # Also ensure the MCP server is executable
    if [ -f "/app/packages/worker/dist/mcp/process-manager-server.js" ]; then
        chmod +x /app/packages/worker/dist/mcp/process-manager-server.js
        echo "✅ MCP server made executable"
    fi
else
    echo "⚠️ Warning: MCP config file not found"
fi

echo "✅ MCP Process Manager setup completed"
echo "💡 Claude Code will automatically discover and use the MCP process management tools"