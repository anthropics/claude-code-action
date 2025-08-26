#!/bin/bash
# Start the process monitor in the background
# This script is called during worker initialization

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROCESS_MANAGER="$SCRIPT_DIR/process-manager.sh"

echo "Starting Claude process monitor..."

# Start the process monitor in the background
nohup "$PROCESS_MANAGER" monitor > /tmp/process-monitor.log 2>&1 &
MONITOR_PID=$!

echo "Process monitor started with PID: $MONITOR_PID"
echo "$MONITOR_PID" > /tmp/process-monitor.pid

# Also provide easy access commands for Claude
cat > /usr/local/bin/claude-processes << 'EOF'
#!/bin/bash
# Convenient wrapper for Claude process management

SCRIPT_DIR="/app/scripts"
PROCESS_MANAGER="$SCRIPT_DIR/process-manager.sh"

# If process-manager.sh exists in current directory, use that instead
if [ -f "./process-manager.sh" ]; then
    PROCESS_MANAGER="./process-manager.sh"
elif [ -f "/app/packages/worker/scripts/process-manager.sh" ]; then
    PROCESS_MANAGER="/app/packages/worker/scripts/process-manager.sh"
fi

exec "$PROCESS_MANAGER" "$@"
EOF

chmod +x /usr/local/bin/claude-processes

echo "✅ Process monitor initialized"
echo "💡 Use 'claude-processes' command to manage background processes"