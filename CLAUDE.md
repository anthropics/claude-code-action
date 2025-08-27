# CLAUDE.md

- You MUST only do what has been asked; nothing more, nothing less. You can check logs with k8s to understand the recent behavior the user is asking for.
- Anytime you make changes in the code that should be tested, you MUST run ./test-bot.js "Relevant prompt" --timeout [based on complexity change by default 10] and make sure it works properly. If the script fails (including getting stuck at "Starting environment setup"), you MUST fix it.
- If you create ephemeral files, you MUST delete them when you're done with them.
- Always use Skaffold to build and run the Slack bot.
- NEVER create files unless they're absolutely necessary for achieving your goal. Instead try to run the code on the fly for testing reasons.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User. If you need to remember something, add it to CLAUDE.md as a a single sentence.
- After making core changes (like removing environment variables), restart pods with: `kubectl rollout restart deployment/peerbot-dispatcher -n peerbot` to ensure latest code is running.
- Keep `make dev` running continuously - If Skaffold stops detecting changes, restart the `make dev` session.

## Deployment Instructions

When making changes to the Slack bot with `make dev` running:

1. **Dispatcher changes** (packages/dispatcher/): Skaffold will auto-rebuild and deploy
2. **Worker changes** (packages/worker/): Skaffold will auto-rebuild and deploy
3. **Core-runner changes** (packages/core-runner/): First build core-runner, then Skaffold will detect worker changes:
   ```bash
   cd packages/core-runner && bun run build
   # Skaffold will detect the change and rebuild worker automatically
   ```

The bot updates automatically when running `make dev` - no manual steps needed!

## Development Configuration

- Rate limiting is disabled in local development (dispatcher.disableRateLimit: true in values-local.yaml)
- To manually rebuild worker image if needed: `docker build -f Dockerfile.worker -t claude-worker:latest .`

## Persistent Storage

Worker pods now use persistent volumes for data storage:

1. **Persistent Volumes**: Each worker pod mounts a persistent volume at `/workspace` to preserve data across pod restarts
2. **Auto-Resume**: The worker automatically resumes conversations using Claude CLI's built-in `--resume` functionality when continuing a thread in the same persistent volume
3. **Data Persistence**: All workspace data is preserved in the persistent volume, eliminating the need for conversation file syncing
   