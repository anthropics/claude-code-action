#!/bin/bash
# Process Manager for Background Processes in Claude Code
# This script manages background processes with proper daemonization,
# output redirection, monitoring, and restart capabilities

PROCESS_DIR="/tmp/claude-processes"
LOGS_DIR="/tmp/claude-logs"

# Create directories
mkdir -p "$PROCESS_DIR" "$LOGS_DIR"

# Function to start a background process with proper daemonization
start_process() {
    local process_id="$1"
    local command="$2"
    local description="$3"
    
    echo "Starting process: $process_id"
    echo "Command: $command"
    echo "Description: $description"
    
    # Create process info file
    cat > "$PROCESS_DIR/$process_id.info" << EOF
command=$command
description=$description
started_at=$(date -Iseconds)
status=starting
restart_count=0
EOF
    
    # Start process with nohup, redirecting all output
    nohup bash -c "
        echo \"Process $process_id starting at \$(date)\" >> \"$LOGS_DIR/$process_id.log\"
        echo \"Command: $command\" >> \"$LOGS_DIR/$process_id.log\"
        echo \"---\" >> \"$LOGS_DIR/$process_id.log\"
        
        # Execute the command and capture all output
        $command >> \"$LOGS_DIR/$process_id.log\" 2>&1 &
        
        # Store the PID
        echo \$! > \"$PROCESS_DIR/$process_id.pid\"
        
        # Update status
        sed -i 's/status=starting/status=running/' \"$PROCESS_DIR/$process_id.info\"
        echo \"pid=\$!\" >> \"$PROCESS_DIR/$process_id.info\"
        
        # Wait for the process to complete
        wait \$!
        exit_code=\$?
        
        # Log completion
        echo \"Process $process_id completed with exit code \$exit_code at \$(date)\" >> \"$LOGS_DIR/$process_id.log\"
        
        # Update status
        sed -i 's/status=running/status=completed/' \"$PROCESS_DIR/$process_id.info\"
        echo \"exit_code=\$exit_code\" >> \"$PROCESS_DIR/$process_id.info\"
        echo \"completed_at=\$(date -Iseconds)\" >> \"$PROCESS_DIR/$process_id.info\"
        
    " > /dev/null 2>&1 &
    
    # Wait a moment for process to start
    sleep 1
    
    # Check if it started successfully
    if [ -f "$PROCESS_DIR/$process_id.pid" ]; then
        local pid=$(cat "$PROCESS_DIR/$process_id.pid")
        if kill -0 "$pid" 2>/dev/null; then
            echo "✅ Process $process_id started successfully (PID: $pid)"
            return 0
        else
            echo "❌ Process $process_id failed to start"
            return 1
        fi
    else
        echo "❌ Process $process_id failed to initialize"
        return 1
    fi
}

# Function to check process status
check_status() {
    local process_id="$1"
    
    if [ ! -f "$PROCESS_DIR/$process_id.info" ]; then
        echo "Process $process_id: NOT FOUND"
        return 1
    fi
    
    source "$PROCESS_DIR/$process_id.info"
    
    if [ -f "$PROCESS_DIR/$process_id.pid" ]; then
        local pid=$(cat "$PROCESS_DIR/$process_id.pid")
        if kill -0 "$pid" 2>/dev/null; then
            echo "Process $process_id: RUNNING (PID: $pid)"
            echo "  Description: $description"
            echo "  Started: $started_at"
            return 0
        else
            echo "Process $process_id: DEAD (was PID: $pid)"
            echo "  Description: $description"
            echo "  Started: $started_at"
            return 1
        fi
    else
        echo "Process $process_id: $status"
        echo "  Description: $description"
        return 1
    fi
}

# Function to get process logs (last N lines)
get_logs() {
    local process_id="$1"
    local lines="${2:-50}"
    
    if [ -f "$LOGS_DIR/$process_id.log" ]; then
        echo "=== Last $lines lines of $process_id logs ==="
        tail -n "$lines" "$LOGS_DIR/$process_id.log"
    else
        echo "No logs found for process $process_id"
    fi
}

# Function to restart a failed process
restart_process() {
    local process_id="$1"
    
    if [ ! -f "$PROCESS_DIR/$process_id.info" ]; then
        echo "Process $process_id not found"
        return 1
    fi
    
    source "$PROCESS_DIR/$process_id.info"
    
    # Update restart count
    local new_count=$((restart_count + 1))
    sed -i "s/restart_count=$restart_count/restart_count=$new_count/" "$PROCESS_DIR/$process_id.info"
    
    echo "Restarting process $process_id (attempt #$new_count)..."
    echo "Process $process_id restarted at $(date) (attempt #$new_count)" >> "$LOGS_DIR/$process_id.log"
    
    # Start the process again
    start_process "$process_id" "$command" "$description"
}

# Function to list all processes
list_processes() {
    echo "=== Claude Background Processes ==="
    
    if [ ! -d "$PROCESS_DIR" ] || [ -z "$(ls -A "$PROCESS_DIR" 2>/dev/null)" ]; then
        echo "No background processes found"
        return 0
    fi
    
    for info_file in "$PROCESS_DIR"/*.info; do
        [ -f "$info_file" ] || continue
        local process_id=$(basename "$info_file" .info)
        check_status "$process_id"
        echo
    done
}

# Function to kill a process
kill_process() {
    local process_id="$1"
    
    if [ -f "$PROCESS_DIR/$process_id.pid" ]; then
        local pid=$(cat "$PROCESS_DIR/$process_id.pid")
        if kill -0 "$pid" 2>/dev/null; then
            echo "Killing process $process_id (PID: $pid)..."
            kill -TERM "$pid"
            sleep 2
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                echo "Force killing process $process_id..."
                kill -KILL "$pid"
            fi
            
            echo "Process $process_id stopped"
            echo "Process $process_id killed at $(date)" >> "$LOGS_DIR/$process_id.log"
            
            # Update status
            sed -i 's/status=running/status=killed/' "$PROCESS_DIR/$process_id.info"
        else
            echo "Process $process_id is not running"
        fi
    else
        echo "Process $process_id PID file not found"
    fi
}

# Function to monitor and auto-restart processes
monitor_processes() {
    echo "Starting process monitor..."
    
    while true; do
        for info_file in "$PROCESS_DIR"/*.info; do
            [ -f "$info_file" ] || continue
            local process_id=$(basename "$info_file" .info)
            
            source "$info_file"
            
            # Only monitor running processes
            if [ "$status" = "running" ]; then
                if [ -f "$PROCESS_DIR/$process_id.pid" ]; then
                    local pid=$(cat "$PROCESS_DIR/$process_id.pid")
                    if ! kill -0 "$pid" 2>/dev/null; then
                        echo "⚠️  Process $process_id died unexpectedly, restarting..."
                        restart_process "$process_id"
                    fi
                fi
            fi
        done
        
        sleep 30  # Check every 30 seconds
    done
}

# Main command handler
case "$1" in
    start)
        start_process "$2" "$3" "$4"
        ;;
    status)
        if [ -z "$2" ]; then
            list_processes
        else
            check_status "$2"
        fi
        ;;
    logs)
        get_logs "$2" "$3"
        ;;
    restart)
        restart_process "$2"
        ;;
    kill)
        kill_process "$2"
        ;;
    monitor)
        monitor_processes
        ;;
    *)
        echo "Usage: $0 {start|status|logs|restart|kill|monitor}"
        echo ""
        echo "Commands:"
        echo "  start <id> <command> <description>  - Start a background process"
        echo "  status [id]                         - Check process status"  
        echo "  logs <id> [lines]                   - Show process logs"
        echo "  restart <id>                        - Restart a process"
        echo "  kill <id>                           - Kill a process"
        echo "  monitor                             - Monitor and auto-restart processes"
        echo ""
        echo "Examples:"
        echo "  $0 start web-server 'bun run dev' 'Development web server'"
        echo "  $0 start tunnel 'cloudflared tunnel --url http://localhost:3000' 'Cloudflare tunnel'"
        echo "  $0 status"
        echo "  $0 logs web-server 100"
        exit 1
        ;;
esac