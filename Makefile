# Development Makefile for Peerbot

.PHONY: help setup build compile dev test clean logs restart

# Default target
help:
	@echo "Available commands:"
	@echo "  make setup     - Interactive setup for Slack bot development"
	@echo "  make dev       - Start Skaffold in dev mode with auto-rebuild"
	@echo "  make test      - Run test bot"
	@echo "  make clean     - Stop Skaffold and clean up resources"

# Interactive setup for development
setup:
	@echo "🚀 Starting PeerBot development setup..."
	@./bin/setup-slack.sh

# Start development with Skaffold
dev:
	@if [ ! -f .env ]; then \
		echo "❌ .env file not found!"; \
		echo ""; \
		echo "Please run setup first:"; \
		echo "  make setup"; \
		echo ""; \
		exit 1; \
	fi
	@if [ ! -f charts/peerbot/values-local.yaml ]; then \
		echo "❌ values-local.yaml not found!"; \
		echo ""; \
		echo "Please run setup first:"; \
		echo "  make setup"; \
		echo ""; \
		exit 1; \
	fi
	@echo "🚀 Starting Skaffold development mode..."
	@echo "   This will:"
	@echo "   - Sync .env values to Helm values"
	@echo "   - Watch for file changes"
	@echo "   - Automatically rebuild and redeploy"
	@echo "   - Stream logs to console"
	@echo ""
	@./bin/sync-env-to-values.sh
	@skaffold dev --port-forward $(if $(filter --debug,$(MAKECMDGOALS)),--verbosity=debug)

# Catch-all target to prevent errors when passing arguments
%:
	@:

# Run test bot
test:
	@echo "🧪 Running test bot..."
	@source .env && node test-bot.js --qa
# Clean up
clean:
	@echo "🧹 Destroying..."
	@skaffold delete --namespace=peerbot || true
	@kubectl delete deployment -n peerbot --all || true
	@kubectl delete pod -n peerbot --all || true
	@echo "✅ Deployment destroyed"