# VM Diagnostics Toolkit - Complete Guide

## Overview

A comprehensive observability tool for inspecting your Claude VM's architecture:

- **Processes** (all PIDs, memory, CPU, hierarchy)
- **Sockets** (Unix domain socket communication)
- **Network** (TCP connections, remote IPs)
- **Services** (systemd services and logs)
- **Correlations** (how they all relate)

---

## Quick Start

### Interactive Mode

```bash
python3 /root/vm_diagnostics.py
```

Then type commands like:

```
vm_diag> help
vm_diag> process_summary
vm_diag> show_tree
vm_diag> quit
```

### Command Line

```bash
python3 /root/vm_diagnostics.py process_summary
python3 /root/vm_diagnostics.py show_tree 1
python3 /root/vm_diagnostics.py service_health ssh
```

### Using the Wrapper

```bash
chmod +x /root/vm_diag
/root/vm_diag help
/root/vm_diag process_summary
/root/vm_diag show_tree
```

---

## Available Commands

### **Summary Commands** (Quick Overview)

#### `process_summary`

Lists all running processes with key metrics

```bash
vm_diag process_summary
```

**Output:** PID, command, parent, children count, CPU%, memory

#### `socket_summary`

Lists all Unix domain sockets and their connections

```bash
vm_diag socket_summary
```

**Output:** Socket path, number of connected clients, listener PID

#### `service_summary`

Lists all systemd services

```bash
vm_diag service_summary
```

**Output:** Service name, state, enabled, PID

#### `network_summary`

Lists all active network connections

```bash
vm_diag network_summary
```

**Output:** Local address, remote address, connection state, owning PID

---

### **Diagnostic Commands** (Answer Specific Questions)

#### `find_socket <path>`

**Question:** "What process owns this socket?"

```bash
vm_diag find_socket /run/coworkd/ask-claude.sock
```

**Output:**

```json
{
  "socket": "/run/coworkd/ask-claude.sock",
  "owner": {
    "pid": 1340,
    "command": "coworkd --daemon",
    "parent_pid": 1
  },
  "clients": [
    { "pid": 14232, "command": "python /usr/local/bin/claude" },
    { "pid": 14250, "command": "python /usr/local/bin/claude" }
  ]
}
```

#### `find_process <pid>`

**Question:** "What sockets and connections does this process use?"

```bash
vm_diag find_process 14232
```

**Output:**

```json
{
  "process": {
    "pid": 14232,
    "command": "python /usr/local/bin/claude",
    "parent_pid": 1340
  },
  "sockets": ["/run/coworkd/ask-claude.sock"],
  "connections": [
    {
      "remote_ip": "api.anthropic.com",
      "remote_port": 443,
      "state": "ESTABLISHED"
    }
  ]
}
```

#### `trace_connection <ip> <port>`

**Question:** "Where did this connection come from?"

```bash
vm_diag trace_connection api.anthropic.com 443
```

**Output:**

```json
{
  "connection": {
    "remote_ip": "api.anthropic.com",
    "remote_port": 443,
    "state": "ESTABLISHED"
  },
  "origin_chain": [
    { "pid": 14232, "command": "claude-session", "parent_pid": 1340 },
    { "pid": 1340, "command": "coworkd --daemon", "parent_pid": 1 },
    { "pid": 1, "command": "init" }
  ]
}
```

#### `service_health <name>`

**Question:** "Is this service healthy?"

```bash
vm_diag service_health coworkd
```

**Output:**

```json
{
  "service": "coworkd",
  "state": "running",
  "checks": {
    "running": true,
    "memory_mb": 45.2,
    "cpu_usage": 2.3,
    "recent_logs": ["[2026-08-24] Service started", ...]
  }
}
```

#### `api_trace`

**Question:** "What's happening with API requests?"

```bash
vm_diag api_trace
```

**Output:**

```json
{
  "scenario": "API calls to Anthropic",
  "timeline": [
    {
      "time": "2026-08-24T10:15:25",
      "event": "Process 14232 API call",
      "remote": "api.anthropic.com:443",
      "state": "ESTABLISHED"
    }
  ],
  "active_api_calls": 2
}
```

#### `correlate <search_term>`

**Question:** "What's related to this search term?"

```bash
vm_diag correlate anthropic
```

**Output:**

```json
{
  "search": "anthropic",
  "processes": [{ "pid": 14232, "command": "claude-session" }],
  "services": [],
  "sockets": []
}
```

---

### **Visualization Commands**

#### `show_tree [pid]`

**Display:** Process hierarchy as ASCII tree

```bash
vm_diag show_tree 1
```

**Output:**

```
├─     1 /process_api --firecracker-init
├─     2 kthreadd
│ ├─    3 pool_workqueue_release
│ ├─    4 kworker/R-rcu_gp
│ └─    9 kworker/0:0-events
├─  1340 coworkd --daemon
│ ├─ 14232 python /usr/local/bin/claude
│ ├─ 14250 python /usr/local/bin/claude
│ └─ 14300 python /usr/local/bin/claude
└─   999 sdk-daemon
```

#### `show_socket_map`

**Display:** Socket connections as diagram

```bash
vm_diag show_socket_map
```

**Output:**

```
SOCKET CONNECTIONS
============================================================

Socket: /run/coworkd/ask-claude.sock
  ├─ LISTENER: PID 1340 (coworkd --daemon)
  └─ CLIENT: PID 14232 (python /usr/local/bin/claude)
  └─ CLIENT: PID 14250 (python /usr/local/bin/claude)

Socket: ~/.pcsc11/pcsd.comm
  ├─ LISTENER: PID 999 (sdk-daemon)
  └─ CLIENT: PID 1340 (coworkd --daemon)
```

#### `help`

**Display:** All available commands

```bash
vm_diag help
```

---

## Real-World Examples

### 1. "My Claude session seems slow. What's happening?"

```bash
# Get all processes
vm_diag process_summary | grep claude

# See what the session is connected to
vm_diag find_process 14232

# Check if the coworkd service is healthy
vm_diag service_health coworkd

# See the full process tree
vm_diag show_tree 1340
```

### 2. "Is the API connection working?"

```bash
# See active API calls
vm_diag api_trace

# Find a specific connection
vm_diag trace_connection api.anthropic.com 443

# See what process opened it
vm_diag find_process $(vm_diag api_trace | grep "owning_pid")
```

### 3. "What's using the coworkd socket?"

```bash
# Find the coworkd socket owner
vm_diag find_socket /run/coworkd/ask-claude.sock

# See what it's connected to
vm_diag show_socket_map
```

### 4. "Did the service crash or restart?"

```bash
# Take a snapshot now
vm_diag service_summary > /tmp/snapshot1.json

# (wait a bit, do something)

# Take another snapshot
vm_diag service_summary > /tmp/snapshot2.json

# Compare
diff /tmp/snapshot1.json /tmp/snapshot2.json
```

### 5. "Show me everything related to 'coworkd'"

```bash
vm_diag correlate coworkd
```

---

## Architecture Reference

### How The Tool Works

**Tier 1: Collectors**

- Read `/proc/[pid]/status`, `/proc/[pid]/stat`, `/proc/[pid]/cmdline`
- Parse `netstat`, `systemctl` output
- Gather raw system state

**Tier 2: Correlation Engine**

- Link processes to sockets they open
- Link services to processes that run them
- Map network connections to processes

**Tier 3: Diagnostics**

- Answer "who owns what?"
- Trace connections to origin
- Find related activity
- Check service health

**Tier 4: Reporting**

- Format output as JSON
- Generate ASCII diagrams
- Provide summaries

---

## Performance Notes

- First run: ~1-2 seconds (collects all data)
- Memory: ~50MB (caches process list)
- Safe: Read-only, no system modifications

---

## Integration with Anthropic Tools

This toolkit works standalone, but can be extended with:

```bash
# vm_* tools (when vm_sockets, vm_socket_connections available)
vm_diag find_socket /run/coworkd/ask-claude.sock

# Service logs (via vm_service_logs)
vm_diag service_health coworkd

# Process tracing (via vm_request_trace / strace)
vm_diag trace_api_request
```

---

## Quick Command Reference

| Task                 | Command                                |
| -------------------- | -------------------------------------- |
| See all processes    | `vm_diag process_summary`              |
| See process tree     | `vm_diag show_tree`                    |
| Find socket owner    | `vm_diag find_socket <path>`           |
| Find process sockets | `vm_diag find_process <pid>`           |
| Trace connection     | `vm_diag trace_connection <ip> <port>` |
| Check service        | `vm_diag service_health <name>`        |
| API requests         | `vm_diag api_trace`                    |
| Search               | `vm_diag correlate <term>`             |
| Socket diagram       | `vm_diag show_socket_map`              |
| Help                 | `vm_diag help`                         |

---

## Extending the Tool

Add new diagnostic commands by adding methods to `Diagnostics` class:

```python
def find_high_memory_processes(self):
    """Find top 5 memory-using processes"""
    return sorted(self.processes.items(),
                  key=lambda x: x[1].memory_mb,
                  reverse=True)[:5]
```

Then add to `VMDiagnosticsManager`:

```python
def cmd_high_memory(self):
    """high_memory - Show processes using most memory"""
    return self.diagnostics.find_high_memory_processes()
```

---

## Troubleshooting

**No processes collected:**

- Ensure `/proc` is readable
- Check Python permissions

**Sockets/connections empty:**

- `netstat` may not be available
- Run with elevated privileges if needed

**Slow performance:**

- Large number of processes (100+)
- Normal: still completes in <2 seconds

---

## Summary

This is your personal VM observatory. Use it to understand what's running, how services talk to each other, and where API calls are going.

**Start here:** `vm_diag help`
