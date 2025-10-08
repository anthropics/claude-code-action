#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { readFile, writeFile, existsSync } from "fs";
import { promisify } from "util";

const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);

type TodoItem = {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm: string;
};

const TODO_INPUT_PATH = process.env.CLAUDE_TODO_INPUT_FILE;
const TODO_OUTPUT_PATH = process.env.CLAUDE_TODO_OUTPUT_FILE;

class TodoPersistenceServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "todo-persistence-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: "load_todo_list",
          description: "Load the persistent todo list from previous runs",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "save_todo_list",
          description: "Save the current todo list for persistence across runs",
          inputSchema: {
            type: "object",
            properties: {
              todos: {
                type: "array",
                description: "Array of todo items to save",
                items: {
                  type: "object",
                  properties: {
                    content: {
                      type: "string",
                      description: "The task content",
                    },
                    status: {
                      type: "string",
                      enum: ["pending", "in_progress", "completed"],
                      description: "The current status of the task",
                    },
                    activeForm: {
                      type: "string",
                      description: "The present continuous form of the task (used when in progress)",
                    },
                  },
                  required: ["content", "status", "activeForm"],
                },
              },
            },
            required: ["todos"],
          },
        },
        {
          name: "get_todo_status",
          description: "Get information about todo list persistence status",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ];

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "load_todo_list":
            return await this.loadTodoList();

          case "save_todo_list":
            return await this.saveTodoList(args as { todos: TodoItem[] });

          case "get_todo_status":
            return await this.getTodoStatus();

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${errorMessage}`,
            },
          ],
        };
      }
    });
  }

  private async loadTodoList() {
    try {
      if (!TODO_INPUT_PATH || !existsSync(TODO_INPUT_PATH)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                todos: [],
                message: "No persistent todo list found, starting fresh",
              }, null, 2),
            },
          ],
        };
      }

      const data = await readFileAsync(TODO_INPUT_PATH, "utf-8");
      const todoData = JSON.parse(data);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              todos: todoData.todos || [],
              metadata: todoData.metadata || {},
              message: `Loaded ${(todoData.todos || []).length} todos from persistent storage`,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              todos: [],
            }, null, 2),
          },
        ],
      };
    }
  }

  private async saveTodoList(args: { todos: TodoItem[] }) {
    try {
      if (!TODO_OUTPUT_PATH) {
        throw new Error("TODO_OUTPUT_PATH not configured");
      }

      const { todos } = args;

      if (!Array.isArray(todos)) {
        throw new Error("todos must be an array");
      }

      // Validate each todo item
      for (const todo of todos) {
        if (!todo.content || !todo.status || !todo.activeForm) {
          throw new Error("Each todo must have content, status, and activeForm");
        }
        if (!["pending", "in_progress", "completed"].includes(todo.status)) {
          throw new Error("Todo status must be pending, in_progress, or completed");
        }
      }

      const todoData = {
        todos,
        savedAt: new Date().toISOString(),
        runId: process.env.GITHUB_RUN_ID || "unknown",
      };

      await writeFileAsync(TODO_OUTPUT_PATH, JSON.stringify(todoData, null, 2));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Saved ${todos.length} todos to persistent storage`,
              savedCount: todos.length,
              completedCount: todos.filter(t => t.status === "completed").length,
              inProgressCount: todos.filter(t => t.status === "in_progress").length,
              pendingCount: todos.filter(t => t.status === "pending").length,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }, null, 2),
          },
        ],
      };
    }
  }

  private async getTodoStatus() {
    try {
      const persistenceEnabled = process.env.CLAUDE_TODO_PERSISTENCE_ENABLED === "true";
      const hasInputFile = TODO_INPUT_PATH ? existsSync(TODO_INPUT_PATH) : false;
      const hasOutputPath = !!TODO_OUTPUT_PATH;

      let inputFileInfo = null;
      if (hasInputFile && TODO_INPUT_PATH) {
        try {
          const data = await readFileAsync(TODO_INPUT_PATH, "utf-8");
          const todoData = JSON.parse(data);
          inputFileInfo = {
            todoCount: (todoData.todos || []).length,
            metadata: todoData.metadata || {},
          };
        } catch (error) {
          inputFileInfo = { error: "Failed to read input file" };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              persistenceEnabled,
              inputFile: {
                path: TODO_INPUT_PATH || null,
                exists: hasInputFile,
                info: inputFileInfo,
              },
              outputFile: {
                path: TODO_OUTPUT_PATH || null,
                configured: hasOutputPath,
              },
              runId: process.env.GITHUB_RUN_ID || "unknown",
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }, null, 2),
          },
        ],
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const server = new TodoPersistenceServer();
server.run().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});