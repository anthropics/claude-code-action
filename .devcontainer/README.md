# DevContainer for Claude Code Slack Bot

This DevContainer provides a complete development environment for the Claude Code Slack Bot with all necessary tools pre-installed.

## Features

### 🤖 Claude Code Integration
- **Claude Code CLI**: Pre-installed globally for AI-powered development
- **MCP Server**: Process management server configured and ready
- **Custom Instructions**: Tailored for Slack bot development

### 🛠️ Development Tools
- **Bun**: Fast JavaScript/TypeScript runtime and package manager
- **Node.js 18**: For compatibility and npm packages
- **TypeScript**: Full TypeScript support with proper configurations
- **Git & GitHub CLI**: Version control and PR management

### ☸️ Kubernetes Stack
- **kubectl**: Kubernetes command-line tool
- **Helm**: Kubernetes package manager
- **Skaffold**: Continuous development for Kubernetes applications
- **k3s**: Lightweight Kubernetes (optional, for local testing)
- **Docker-in-Docker**: Build and run containers within the devcontainer

### 📊 Database & Monitoring
- **PostgreSQL Client**: Database interaction tools
- **Redis Tools**: Cache management utilities

## Getting Started

### 1. Prerequisites
- VS Code with Remote-Containers extension
- Docker Desktop or equivalent
- Environment variables in `.env` file

### 2. Opening in DevContainer

1. Open the project in VS Code
2. Press `F1` and select "Dev Containers: Reopen in Container"
3. Wait for the container to build (first time takes ~5-10 minutes)
4. The post-create script will automatically:
   - Install all dependencies
   - Build all packages
   - Setup MCP configuration
   - Create necessary environment files

### 3. Environment Setup

Create a `.env` file with your credentials:
```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
GITHUB_TOKEN=ghp_...
CLAUDE_API_KEY=sk-ant-...
```

### 4. Running the Application

```bash
# Start development with hot reload
make dev

# Or manually with Skaffold
skaffold dev --port-forward
```

## Available Commands

### Shortcuts
- `k` → kubectl
- `kp` → kubectl get pods
- `kl` → kubectl logs
- `kd` → kubectl describe
- `ka` → kubectl apply -f
- `kx` → kubectl exec -it
- `sk` → skaffold
- `skd` → skaffold dev
- `skb` → skaffold build

### Testing
```bash
# Test the bot with a message
./test-bot.js "Hello, test message"

# Test with timeout
./test-bot.js "Complex task" --timeout 30
```

### Development
```bash
# Build all packages
bun run build:all

# Watch mode for a specific package
cd packages/worker && bun run dev

# Run tests
bun test
```

## Port Forwarding

The following ports are automatically forwarded:

| Port | Service | Description |
|------|---------|-------------|
| 3000 | Slack App | Main application endpoint |
| 3001 | Dispatcher (Skaffold) | Development server |
| 3002 | Dispatcher Service | Service endpoint |
| 5432 | PostgreSQL Internal | Database internal port |
| 5433 | PostgreSQL Forwarded | Database external access |
| 8080 | Health Check | Liveness/readiness probes |
| 8081 | Orchestrator | Worker orchestration service |

## MCP Process Manager

The MCP (Model Context Protocol) server is automatically configured for Claude Code. Available tools:

- `start_process` - Start a background process
- `stop_process` - Stop a running process
- `restart_process` - Restart a process
- `get_process_status` - Check process status
- `get_process_logs` - Retrieve process logs
- `monitor_processes` - Enable auto-restart monitoring

## Troubleshooting

### Container won't start
- Check Docker Desktop is running
- Ensure you have enough disk space (needs ~10GB)
- Try rebuilding: "Dev Containers: Rebuild Container"

### Kubernetes not working
- The devcontainer uses Docker-in-Docker by default
- For k3s, you may need to increase Docker memory to 4GB+
- Check kubectl config: `kubectl config view`

### Dependencies not installing
- Clear Bun cache: `bun pm cache rm`
- Remove node_modules: `rm -rf node_modules packages/*/node_modules`
- Reinstall: `bun install`

### MCP server not detected
- Check config exists: `cat ~/.claude/settings.mcp.json`
- Restart Claude Code CLI
- Verify server is built: `ls packages/worker/dist/mcp/`

## VS Code Extensions

The following extensions are automatically installed:
- Docker
- Kubernetes Tools
- ESLint
- Prettier
- TypeScript
- GitHub Copilot (if you have access)

## Resources

- [Claude Code Documentation](https://docs.anthropic.com/claude-code)
- [Skaffold Documentation](https://skaffold.dev/docs/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Bun Documentation](https://bun.sh/docs)