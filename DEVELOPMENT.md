# Development Setup Guide

This guide helps you set up the Peerbot for local development.

## Prerequisites

Before starting, ensure you have the following installed:

1. **Kubernetes** - [Download for Mac](https://orbstack.dev/)
2. **kubectl** - [Install Guide](https://kubernetes.io/docs/tasks/tools/)
3. **Skaffold** - [Install Guide](https://skaffold.dev/docs/install/)
4. **Bun** - Install with: `curl -fsSL https://bun.sh/install | bash`
5. **Node.js** (v18+) - [Download](https://nodejs.org/)

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