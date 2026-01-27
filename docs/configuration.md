# Advanced Configuration

## Using Custom MCP Configuration

You can add custom MCP (Model Context Protocol) servers to extend Claude's capabilities using the `--mcp-config` flag in `claude_args`. These servers merge with the built-in GitHub MCP servers.

### Basic Example: Adding a Sequential Thinking Server

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    claude_args: |
      --mcp-config '{"mcpServers": {"sequential-thinking": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]}}}'
      --allowedTools mcp__sequential-thinking__sequentialthinking
    # ... other inputs
```

### Passing Secrets to MCP Servers

For MCP servers that require sensitive information like API keys or tokens, you can create a configuration file with GitHub Secrets:

```yaml
- name: Create MCP Config
  run: |
    cat > /tmp/mcp-config.json << 'EOF'
    {
      "mcpServers": {
        "custom-api-server": {
          "command": "npx",
          "args": ["-y", "@example/api-server"],
          "env": {
            "API_KEY": "${{ secrets.CUSTOM_API_KEY }}",
            "BASE_URL": "https://api.example.com"
          }
        }
      }
    }
    EOF

- uses: anthropics/claude-code-action@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    claude_args: |
      --mcp-config /tmp/mcp-config.json
    # ... other inputs
```

### Using Python MCP Servers with uv

For Python-based MCP servers managed with `uv`, you need to specify the directory containing your server:

```yaml
- name: Create MCP Config for Python Server
  run: |
    cat > /tmp/mcp-config.json << 'EOF'
    {
      "mcpServers": {
        "my-python-server": {
          "type": "stdio",
          "command": "uv",
          "args": [
            "--directory",
            "${{ github.workspace }}/path/to/server/",
            "run",
            "server_file.py"
          ]
        }
      }
    }
    EOF

- uses: anthropics/claude-code-action@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    claude_args: |
      --mcp-config /tmp/mcp-config.json
      --allowedTools my-python-server__<tool_name>  # Replace <tool_name> with your server's tool names
    # ... other inputs
```

For example, if your Python MCP server is at `mcp_servers/weather.py`, you would use:

```yaml
"args":
  ["--directory", "${{ github.workspace }}/mcp_servers/", "run", "weather.py"]
```

### Multiple MCP Servers

You can add multiple MCP servers by using multiple `--mcp-config` flags:

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    claude_args: |
      --mcp-config /tmp/config1.json
      --mcp-config /tmp/config2.json
      --mcp-config '{"mcpServers": {"inline-server": {"command": "npx", "args": ["@example/server"]}}}'
    # ... other inputs
```

**Important**:

- Always use GitHub Secrets (`${{ secrets.SECRET_NAME }}`) for sensitive values like API keys, tokens, or passwords. Never hardcode secrets directly in the workflow file.
- Your custom servers will override any built-in servers with the same name.
- The `claude_args` supports multiple `--mcp-config` flags that will be merged together.

## Additional Permissions for CI/CD Integration

The `additional_permissions` input allows Claude to access GitHub Actions workflow information when you grant the necessary permissions. This is particularly useful for analyzing CI/CD failures and debugging workflow issues.

### Enabling GitHub Actions Access

To allow Claude to view workflow run results, job logs, and CI status:

1. **Grant the necessary permission to your GitHub token**:

   - When using the default `GITHUB_TOKEN`, add the `actions: read` permission to your workflow:

   ```yaml
   permissions:
     contents: write
     pull-requests: write
     issues: write
     actions: read # Add this line
   ```

2. **Configure the action with additional permissions**:

   ```yaml
   - uses: anthropics/claude-code-action@v1
     with:
       anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
       additional_permissions: |
         actions: read
       # ... other inputs
   ```

3. **Claude will automatically get access to CI/CD tools**:
   When you enable `actions: read`, Claude can use the following MCP tools:
   - `mcp__github_ci__get_ci_status` - View workflow run statuses
   - `mcp__github_ci__get_workflow_run_details` - Get detailed workflow information
   - `mcp__github_ci__download_job_log` - Download and analyze job logs

### Example: Debugging Failed CI Runs

```yaml
name: Claude CI Helper
on:
  issue_comment:
    types: [created]

permissions:
  contents: write
  pull-requests: write
  issues: write
  actions: read # Required for CI access

jobs:
  claude-ci-helper:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          additional_permissions: |
            actions: read
          # Now Claude can respond to "@claude why did the CI fail?"
```

**Important Notes**:

- The GitHub token must have the `actions: read` permission in your workflow
- If the permission is missing, Claude will warn you and suggest adding it
- Currently, only `actions: read` is supported, but the format allows for future extensions

## Custom Environment Variables

You can pass custom environment variables to Claude Code execution using the `settings` input. This is useful for CI/test setups that require specific environment variables:

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    settings: |
      {
        "env": {
          "NODE_ENV": "test",
          "CI": "true",
          "DATABASE_URL": "postgres://test:test@localhost:5432/test_db"
        }
      }
    # ... other inputs
```

These environment variables will be available to Claude Code during execution, allowing it to run tests, build processes, or other commands that depend on specific environment configurations.

## Limiting Conversation Turns

You can limit the number of back-and-forth exchanges Claude can have during task execution using the `claude_args` input. This is useful for:

- Controlling costs by preventing runaway conversations
- Setting time boundaries for automated workflows
- Ensuring predictable behavior in CI/CD pipelines

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    claude_args: |
      --max-turns 5  # Limit to 5 conversation turns
    # ... other inputs
```

When the turn limit is reached, Claude will stop execution gracefully. Choose a value that gives Claude enough turns to complete typical tasks while preventing excessive usage.

## Custom Tools

By default, Claude only has access to:

- File operations (reading, committing, editing files, read-only git commands)
- Comment management (creating/updating comments)
- Basic GitHub operations

Claude does **not** have access to execute arbitrary Bash commands by default. If you want Claude to run specific commands (e.g., npm install, npm test), you must explicitly allow them using the `claude_args` configuration:

**Note**: If your repository has a `.mcp.json` file in the root directory, Claude will automatically detect and use the MCP server tools defined there. However, these tools still need to be explicitly allowed.

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    claude_args: |
      --allowedTools "Bash(npm install),Bash(npm run test),Edit,Replace,NotebookEditCell"
      --disallowedTools "TaskOutput,KillTask"
    # ... other inputs
```

**Note**: The base GitHub tools are always included. Use `--allowedTools` to add additional tools (including specific Bash commands), and `--disallowedTools` to prevent specific tools from being used.

## Custom Model

Specify a Claude model using `claude_args`:

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    claude_args: |
      --model claude-4-0-sonnet-20250805
    # ... other inputs
```

For provider-specific models:

```yaml
# AWS Bedrock
- uses: anthropics/claude-code-action@v1
  with:
    use_bedrock: "true"
    claude_args: |
      --model anthropic.claude-4-0-sonnet-20250805-v1:0
    # ... other inputs

# Google Vertex AI
- uses: anthropics/claude-code-action@v1
  with:
    use_vertex: "true"
    claude_args: |
      --model claude-4-0-sonnet@20250805
    # ... other inputs
```

## Claude Code Settings

You can provide Claude Code settings to customize behavior such as model selection, environment variables, permissions, and hooks. Settings can be provided either as a JSON string or a path to a settings file.

### Option 1: Settings File

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    settings: "path/to/settings.json"
    # ... other inputs
```

### Option 2: Inline Settings

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    settings: |
      {
        "model": "claude-opus-4-1-20250805",
        "env": {
          "DEBUG": "true",
          "API_URL": "https://api.example.com"
        },
        "permissions": {
          "allow": ["Bash", "Read"],
          "deny": ["WebFetch"]
        },
        "hooks": {
          "PreToolUse": [{
            "matcher": "Bash",
            "hooks": [{
              "type": "command",
              "command": "echo Running bash command..."
            }]
          }]
        }
      }
    # ... other inputs
```

The settings support all Claude Code settings options including:

- `model`: Override the default model
- `env`: Environment variables for the session
- `permissions`: Tool usage permissions
- `hooks`: Pre/post tool execution hooks
- And more...

For a complete list of available settings and their descriptions, see the [Claude Code settings documentation](https://docs.anthropic.com/en/docs/claude-code/settings).

**Notes**:

- The `enableAllProjectMcpServers` setting is always set to `true` by this action to ensure MCP servers work correctly.
- The `claude_args` input provides direct access to Claude Code CLI arguments and takes precedence over settings.
- We recommend using `claude_args` for simple configurations and `settings` for complex configurations with hooks and environment variables.

## Migration from Deprecated Inputs

Many individual input parameters have been consolidated into `claude_args` or `settings`. Here's how to migrate:

| Old Input             | New Approach                                             |
| --------------------- | -------------------------------------------------------- |
| `allowed_tools`       | Use `claude_args: "--allowedTools Tool1,Tool2"`          |
| `disallowed_tools`    | Use `claude_args: "--disallowedTools Tool1,Tool2"`       |
| `max_turns`           | Use `claude_args: "--max-turns 10"`                      |
| `model`               | Use `claude_args: "--model claude-4-0-sonnet-20250805"`  |
| `claude_env`          | Use `settings` with `"env"` object                       |
| `custom_instructions` | Use `claude_args: "--system-prompt 'Your instructions'"` |
| `mcp_config`          | Use `claude_args: "--mcp-config '{...}'"`                |
| `direct_prompt`       | Use `prompt` input instead                               |
| `override_prompt`     | Use `prompt` with GitHub context variables               |

## Custom Executables for Specialized Environments

For specialized environments like Nix, custom container setups, or other package management systems where the default installation doesn't work, you can provide your own executables:

### Custom Claude Code Executable

Use `path_to_claude_code_executable` to provide your own Claude Code binary instead of using the automatically installed version:

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    path_to_claude_code_executable: "/path/to/custom/claude"
    # ... other inputs
```

### Custom Bun Executable

Use `path_to_bun_executable` to provide your own Bun runtime instead of the default installation:

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    path_to_bun_executable: "/path/to/custom/bun"
    # ... other inputs
```

**Important**: Using incompatible versions may cause the action to fail. Ensure your custom executables are compatible with the action's requirements.
