#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn, ChildProcess } from "child_process";
import { mkdir, writeFile, readFile, unlink, readdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

interface ProcessInfo {
  id: string;
  command: string;
  description: string;
  status: "starting" | "running" | "completed" | "failed" | "killed";
  pid?: number;
  startedAt: string;
  completedAt?: string;
  exitCode?: number;
  restartCount: number;
  process?: ChildProcess;
}

class ProcessManager {
  private processes: Map<string, ProcessInfo> = new Map();
  private processDir = "/tmp/claude-processes";
  private logsDir = "/tmp/claude-logs";
  private monitorInterval?: NodeJS.Timeout;
  private autoRestart = false;

  constructor() {
    this.init();
  }

  private async init() {
    await mkdir(this.processDir, { recursive: true });
    await mkdir(this.logsDir, { recursive: true });
    await this.loadExistingProcesses();
  }

  private async loadExistingProcesses() {
    try {
      const files = await readdir(this.processDir);
      for (const file of files) {
        if (file.endsWith(".json")) {
          const id = file.replace(".json", "");
          const infoPath = path.join(this.processDir, file);
          const data = await readFile(infoPath, "utf-8");
          const info = JSON.parse(data) as ProcessInfo;
          this.processes.set(id, info);
        }
      }
    } catch (error) {
      console.error("Error loading existing processes:", error);
    }
  }

  private async saveProcessInfo(info: ProcessInfo) {
    const infoPath = path.join(this.processDir, `${info.id}.json`);
    await writeFile(infoPath, JSON.stringify(info, null, 2));
  }

  private async removeProcessInfo(id: string) {
    const infoPath = path.join(this.processDir, `${id}.json`);
    try {
      await unlink(infoPath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }

  private getLogPath(id: string): string {
    return path.join(this.logsDir, `${id}.log`);
  }

  async startProcess(id: string, command: string, description: string): Promise<ProcessInfo> {
    if (this.processes.has(id)) {
      const existing = this.processes.get(id)!;
      if (existing.status === "running" && existing.pid) {
        throw new Error(`Process ${id} is already running with PID ${existing.pid}`);
      }
    }

    const info: ProcessInfo = {
      id,
      command,
      description,
      status: "starting",
      startedAt: new Date().toISOString(),
      restartCount: 0,
    };

    const logPath = this.getLogPath(id);
    const logStream = await import("fs").then(fs => 
      fs.createWriteStream(logPath, { flags: "a" })
    );

    logStream.write(`Process ${id} starting at ${info.startedAt}\n`);
    logStream.write(`Command: ${command}\n`);
    logStream.write(`Description: ${description}\n`);
    logStream.write("---\n");

    const child = spawn("bash", ["-c", command], {
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    info.pid = child.pid;
    info.status = "running";
    info.process = child;

    child.stdout?.on("data", (data) => {
      logStream.write(data);
    });

    child.stderr?.on("data", (data) => {
      logStream.write(data);
    });

    child.on("exit", async (code, signal) => {
      info.status = code === 0 ? "completed" : "failed";
      info.exitCode = code || undefined;
      info.completedAt = new Date().toISOString();
      delete info.process;

      logStream.write(`\nProcess ${id} exited with code ${code} at ${info.completedAt}\n`);
      logStream.end();

      await this.saveProcessInfo(info);

      if (this.autoRestart && info.status === "failed" && info.restartCount < 5) {
        console.error(`Process ${id} failed, attempting restart...`);
        setTimeout(() => this.restartProcess(id), 5000);
      }
    });

    this.processes.set(id, info);
    await this.saveProcessInfo(info);

    return info;
  }

  async stopProcess(id: string): Promise<void> {
    const info = this.processes.get(id);
    if (!info) {
      throw new Error(`Process ${id} not found`);
    }

    if (info.status !== "running" || !info.pid) {
      throw new Error(`Process ${id} is not running`);
    }

    try {
      process.kill(info.pid, "SIGTERM");
      
      // Give process time to terminate gracefully
      setTimeout(() => {
        try {
          process.kill(info.pid!, "SIGKILL");
        } catch (e) {
          // Process already terminated
        }
      }, 5000);

      info.status = "killed";
      info.completedAt = new Date().toISOString();
      delete info.process;
      
      await this.saveProcessInfo(info);
    } catch (error) {
      throw new Error(`Failed to kill process ${id}: ${error}`);
    }
  }

  async restartProcess(id: string): Promise<ProcessInfo> {
    const info = this.processes.get(id);
    if (!info) {
      throw new Error(`Process ${id} not found`);
    }

    // Stop if running
    if (info.status === "running" && info.pid) {
      await this.stopProcess(id);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    info.restartCount++;
    return this.startProcess(id, info.command, info.description);
  }

  getStatus(id?: string): ProcessInfo | ProcessInfo[] | null {
    if (id) {
      return this.processes.get(id) || null;
    }
    return Array.from(this.processes.values());
  }

  async getLogs(id: string, lines: number = 50): Promise<string> {
    const logPath = this.getLogPath(id);
    if (!existsSync(logPath)) {
      return `No logs found for process ${id}`;
    }

    try {
      const content = await readFile(logPath, "utf-8");
      const allLines = content.split("\n");
      const lastLines = allLines.slice(-lines).join("\n");
      return lastLines;
    } catch (error) {
      return `Error reading logs for process ${id}: ${error}`;
    }
  }

  startMonitoring(interval: number = 30000) {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }

    this.autoRestart = true;
    this.monitorInterval = setInterval(() => {
      this.checkProcesses();
    }, interval);
  }

  stopMonitoring() {
    this.autoRestart = false;
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }
  }

  private checkProcesses() {
    const entries = Array.from(this.processes.entries());
    for (const [id, info] of entries) {
      if (info.status === "running" && info.pid) {
        try {
          process.kill(info.pid, 0); // Check if process exists
        } catch (e) {
          // Process is dead
          console.error(`Process ${id} died unexpectedly`);
          info.status = "failed";
          info.completedAt = new Date().toISOString();
          this.saveProcessInfo(info);

          if (this.autoRestart && info.restartCount < 5) {
            setTimeout(() => this.restartProcess(id), 5000);
          }
        }
      }
    }
  }
}

// Initialize MCP server
const manager = new ProcessManager();
const server = new McpServer({
  name: "Process Manager",
  version: "1.0.0",
});

// Register tools
server.tool(
  "start_process",
  "Start a background process with monitoring",
  {
    id: z.string().describe("Unique identifier for the process"),
    command: z.string().describe("Command to execute"),
    description: z.string().describe("Description of what this process does"),
  },
  async ({ id, command, description }) => {
    try {
      const info = await manager.startProcess(id, command, description);
      return {
        content: [
          {
            type: "text",
            text: `Started process ${id} (PID: ${info.pid})`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to start process: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "stop_process",
  "Stop a running process",
  {
    id: z.string().describe("Process ID to stop"),
  },
  async ({ id }) => {
    try {
      await manager.stopProcess(id);
      return {
        content: [
          {
            type: "text",
            text: `Stopped process ${id}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to stop process: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "restart_process",
  "Restart a process",
  {
    id: z.string().describe("Process ID to restart"),
  },
  async ({ id }) => {
    try {
      const info = await manager.restartProcess(id);
      return {
        content: [
          {
            type: "text",
            text: `Restarted process ${id} (PID: ${info.pid}, restart count: ${info.restartCount})`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to restart process: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_process_status",
  "Get status of processes",
  {
    id: z.string().optional().describe("Process ID (omit to get all)"),
  },
  async ({ id }) => {
    const status = manager.getStatus(id);
    if (!status) {
      return {
        content: [
          {
            type: "text",
            text: `Process ${id} not found`,
          },
        ],
        isError: true,
      };
    }

    const processes = Array.isArray(status) ? status : [status];
    const statusText = processes
      .map(
        (p) =>
          `${p.id}: ${p.status}${p.pid ? ` (PID: ${p.pid})` : ""}
  Description: ${p.description}
  Started: ${p.startedAt}${p.completedAt ? `\n  Completed: ${p.completedAt}` : ""}${
            p.exitCode !== undefined ? `\n  Exit code: ${p.exitCode}` : ""
          }
  Restart count: ${p.restartCount}`
      )
      .join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: statusText || "No processes found",
        },
      ],
    };
  }
);

server.tool(
  "get_process_logs",
  "Get logs from a process",
  {
    id: z.string().describe("Process ID"),
    lines: z.number().optional().default(50).describe("Number of lines to retrieve"),
  },
  async ({ id, lines }) => {
    const logs = await manager.getLogs(id, lines);
    return {
      content: [
        {
          type: "text",
          text: logs,
        },
      ],
    };
  }
);

server.tool(
  "monitor_processes",
  "Enable or disable automatic process monitoring and restart",
  {
    enabled: z.boolean().describe("Enable or disable monitoring"),
    interval: z.number().optional().default(30000).describe("Check interval in milliseconds"),
  },
  async ({ enabled, interval }) => {
    if (enabled) {
      manager.startMonitoring(interval);
      return {
        content: [
          {
            type: "text",
            text: `Process monitoring enabled (interval: ${interval}ms)`,
          },
        ],
      };
    } else {
      manager.stopMonitoring();
      return {
        content: [
          {
            type: "text",
            text: "Process monitoring disabled",
          },
        ],
      };
    }
  }
);

// Register resources
server.resource(
  "processes://list",
  "List all managed processes",
  { mimeType: "application/json" },
  async () => {
    const processes = manager.getStatus() as ProcessInfo[];
    return {
      contents: [
        {
          uri: "processes://list",
          mimeType: "application/json",
          text: JSON.stringify(processes, null, 2),
        },
      ],
    };
  }
);

server.resource(
  "processes://logs/*",
  "Get logs for a specific process",
  { mimeType: "text/plain" },
  async (params: any) => {
    const uri = params.uri || params.url || params.toString();
    const id = uri.replace("processes://logs/", "");
    const logs = await manager.getLogs(id, 1000);
    return {
      contents: [
        {
          uri,
          mimeType: "text/plain",
          text: logs,
        },
      ],
    };
  }
);

server.resource(
  "processes://status/*",
  "Get status of a specific process",
  { mimeType: "application/json" },
  async (params: any) => {
    const uri = params.uri || params.url || params.toString();
    const id = uri.replace("processes://status/", "");
    const status = manager.getStatus(id);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[Process Manager MCP] Server started");
}

main().catch((error) => {
  console.error("[Process Manager MCP] Fatal error:", error);
  process.exit(1);
});