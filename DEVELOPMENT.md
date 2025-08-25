# Development Setup Guide

This guide helps you set up the Peerbot for local development.

## Prerequisites

Before starting, ensure you have the following installed:

1. **Kubernetes** - [Download for Mac](https://orbstack.dev/)
2. **kubectl** - [Install Guide](https://kubernetes.io/docs/tasks/tools/)
3. **Skaffold** - [Install Guide](https://skaffold.dev/docs/install/)
4. **Bun** - Install with: `curl -fsSL https://bun.sh/install | bash`
5. **Node.js** (v18+) - [Download](https://nodejs.org/)

## Quick Start

### 1. Clone the Repository
```bash
git clone <repository-url>
cd claude-code-slack
```

### 2. Run the Setup Script
```bash
./setup-dev.sh
```

This script will:
- Check all prerequisites
- Create `.env` file from template (if not exists)
- Create `values-local.yaml` for Helm
- Install dependencies
- Build TypeScript packages
- Build Docker images locally
- Set up Kubernetes namespace

### 3. Configure Environment Variables

Edit the `.env` file with your actual credentials:

```env
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token

# GitHub Configuration
GITHUB_TOKEN=ghp_your-github-token
GITHUB_ORGANIZATION=your-github-org

# Claude Configuration
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-your-claude-token
```

### 4. Start Development Mode
```bash
make dev
```

This will:
- Start Skaffold in watch mode
- Automatically rebuild on file changes
- Deploy to local Kubernetes
- Stream logs to console

## Common Issues & Solutions

### Issue: "Worker image not found"

**Cause**: Docker images aren't built locally yet.

**Solution**: Run the setup script or build manually:
```bash
# Build all images
docker build -f Dockerfile.dispatcher -t peerbot-dispatcher:latest .
docker build -f Dockerfile.orchestrator -t peerbot-orchestrator:latest .
docker build -f Dockerfile.worker -t claude-worker:latest .
```

### Issue: "values-local.yaml not found"

**Cause**: Missing local configuration file.

**Solution**: Run `./setup-dev.sh` or create manually from the template in the setup script.

### Issue: "CPU resource ratio error"

**Cause**: Kubernetes cluster policy restricts CPU limit-to-request ratio.

**Solution**: The setup script configures minimal resources with proper ratios:
- CPU request: 50m, limit: 250m (5:1 ratio)
- Memory request: 128Mi, limit: 256Mi

### Issue: "Port already in use"

**Cause**: Another service is using port 3000.

**Solution**: Stop the conflicting service or change the port in `skaffold.yaml`:
```yaml
portForward:
- localPort: 3001  # Change to available port
```

## Testing the Bot

After setup, test the bot with:
```bash
./test-bot.js "hello world"
```

Or with a specific task:
```bash
./test-bot.js "create a Python hello world script and commit it" --timeout 30
```

## Development Workflow

1. **Make code changes** in `packages/` directories
2. **Skaffold auto-rebuilds** when files change (if `make dev` is running)
3. **Test changes** with the test bot script
4. **Check logs** with:
   ```bash
   kubectl logs -n peerbot -l app.kubernetes.io/component=dispatcher
   kubectl logs -n peerbot -l app.kubernetes.io/component=worker
   ```

## Architecture Overview

- **Dispatcher**: Handles Slack events and enqueues messages
- **Orchestrator**: Creates and manages worker deployments
- **Worker**: Processes messages using Claude Code CLI
- **PostgreSQL**: Stores queue data and state

## Troubleshooting Commands

```bash
# View all pods
kubectl get pods -n peerbot

# Check dispatcher logs
kubectl logs -n peerbot -l app.kubernetes.io/component=dispatcher

# Check worker logs
kubectl logs -n peerbot -l app.kubernetes.io/component=worker

# Restart dispatcher
kubectl rollout restart deployment/peerbot-dispatcher -n peerbot

# Delete failed worker pods
kubectl delete pods -n peerbot -l app.kubernetes.io/component=worker

# Check events
kubectl get events -n peerbot --sort-by=.metadata.creationTimestamp
```

## Clean Up

To stop and clean up all resources:
```bash
# Stop Skaffold (Ctrl+C in the terminal running make dev)

# Delete all resources
skaffold delete --namespace=peerbot

# Or use make
make destroy
```