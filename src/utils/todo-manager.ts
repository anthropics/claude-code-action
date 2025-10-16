import * as core from "@actions/core";
import { join } from "path";
import {
  downloadTodoListArtifact,
  uploadTodoListArtifact,
  writeTodoListForClaude,
  readTodoListFromClaude,
  mergeTodoLists,
  createTodoList,
  type TodoList,
  type TodoItem,
} from "./todo-persistence";

export class TodoManager {
  private todoList: TodoList | null = null;
  private readonly todoInputPath: string;
  private readonly todoOutputPath: string;

  constructor() {
    const tempDir = process.env.RUNNER_TEMP || "/tmp";
    this.todoInputPath = join(tempDir, "claude-todo-input.json");
    this.todoOutputPath = join(tempDir, "claude-todo-output.json");
  }

  /**
   * Initialize the todo manager by downloading existing artifacts
   */
  async initialize(): Promise<void> {
    try {
      core.startGroup("Initializing Todo List Persistence");

      // Check if todo persistence is enabled
      const todoPermissionEnabled =
        process.env.ENABLE_TODO_PERSISTENCE === "true";
      if (!todoPermissionEnabled) {
        core.info("Todo persistence is disabled, skipping initialization");
        return;
      }

      this.todoList = await downloadTodoListArtifact();

      if (this.todoList) {
        core.info(
          `Loaded existing todo list with ${this.todoList.todos.length} items`,
        );
        this.logTodoSummary(this.todoList);
      } else {
        core.info("No existing todo list found, starting fresh");
        this.todoList = createTodoList([]);
      }
    } catch (error) {
      core.warning(`Error initializing todo manager: ${error}`);
      this.todoList = createTodoList([]);
    } finally {
      core.endGroup();
    }
  }

  /**
   * Prepare todo list for Claude execution
   */
  async prepareTodoForClaude(initialTodos?: TodoItem[]): Promise<void> {
    try {
      core.startGroup("Preparing Todo List for Claude");

      // Check if todo persistence is enabled
      const todoPermissionEnabled =
        process.env.ENABLE_TODO_PERSISTENCE === "true";
      if (!todoPermissionEnabled) {
        core.info("Todo persistence is disabled, skipping preparation");
        return;
      }

      // If initial todos are provided, merge them with existing ones
      if (initialTodos && initialTodos.length > 0) {
        this.todoList = mergeTodoLists(this.todoList, initialTodos);
        core.info(`Merged ${initialTodos.length} new todos with existing list`);
      }

      // Write todo list for Claude to access
      if (this.todoList) {
        await writeTodoListForClaude(this.todoList, this.todoInputPath);

        // Also set environment variables for Claude
        process.env.CLAUDE_TODO_INPUT_FILE = this.todoInputPath;
        process.env.CLAUDE_TODO_OUTPUT_FILE = this.todoOutputPath;
        process.env.CLAUDE_TODO_PERSISTENCE_ENABLED = "true";

        core.info(`Todo list prepared at: ${this.todoInputPath}`);
        this.logTodoSummary(this.todoList);
      }
    } catch (error) {
      core.warning(`Error preparing todo list for Claude: ${error}`);
    } finally {
      core.endGroup();
    }
  }

  /**
   * Finalize todo list after Claude execution
   */
  async finalizeTodoAfterClaude(): Promise<void> {
    try {
      core.startGroup("Finalizing Todo List After Claude Execution");

      // Check if todo persistence is enabled
      const todoPermissionEnabled =
        process.env.ENABLE_TODO_PERSISTENCE === "true";
      if (!todoPermissionEnabled) {
        core.info("Todo persistence is disabled, skipping finalization");
        return;
      }

      // Try to read updated todo list from Claude's output
      const updatedTodos = await readTodoListFromClaude(this.todoOutputPath);

      if (updatedTodos && this.todoList) {
        // Update our todo list with Claude's changes
        this.todoList = mergeTodoLists(this.todoList, updatedTodos);

        core.info(
          `Todo list updated with ${updatedTodos.length} items from Claude`,
        );
        this.logTodoSummary(this.todoList);

        // Upload the updated todo list as an artifact
        await uploadTodoListArtifact(this.todoList);
      } else if (this.todoList) {
        // Even if Claude didn't update todos, upload the current state
        await uploadTodoListArtifact(this.todoList);
        core.info("Uploaded current todo list state (no updates from Claude)");
      }
    } catch (error) {
      core.warning(`Error finalizing todo list: ${error}`);
    } finally {
      core.endGroup();
    }
  }

  /**
   * Get the current todo list
   */
  getTodoList(): TodoList | null {
    return this.todoList;
  }

  /**
   * Update the current todo list
   */
  updateTodoList(todos: TodoItem[]): void {
    if (this.todoList) {
      this.todoList = mergeTodoLists(this.todoList, todos);
    } else {
      this.todoList = createTodoList(todos);
    }
  }

  /**
   * Get the file paths for todo input/output
   */
  getFilePaths(): { input: string; output: string } {
    return {
      input: this.todoInputPath,
      output: this.todoOutputPath,
    };
  }

  /**
   * Generate markdown summary of todos for comments
   */
  generateTodoSummaryMarkdown(): string {
    if (!this.todoList || this.todoList.todos.length === 0) {
      return "";
    }

    const todos = this.todoList.todos;
    const completedCount = todos.filter((t) => t.status === "completed").length;

    let summary = `\n\n### 📋 Task Progress (${completedCount}/${todos.length} completed)\n\n`;

    todos.forEach((todo) => {
      const checkbox =
        todo.status === "completed"
          ? "☑️"
          : todo.status === "in_progress"
            ? "🔄"
            : "⬜";
      const text =
        todo.status === "in_progress" ? todo.activeForm : todo.content;
      summary += `${checkbox} ${text}\n`;
    });

    return summary;
  }

  /**
   * Log a summary of the current todo list
   */
  private logTodoSummary(todoList: TodoList): void {
    const todos = todoList.todos;
    const completedCount = todos.filter((t) => t.status === "completed").length;
    const inProgressCount = todos.filter(
      (t) => t.status === "in_progress",
    ).length;
    const pendingCount = todos.filter((t) => t.status === "pending").length;

    core.info(
      `Todo Summary: ${completedCount} completed, ${inProgressCount} in progress, ${pendingCount} pending`,
    );

    if (todos.length > 0) {
      core.info("Current todos:");
      todos.forEach((todo, index) => {
        const status =
          todo.status === "completed"
            ? "✓"
            : todo.status === "in_progress"
              ? "⟳"
              : "○";
        const text =
          todo.status === "in_progress" ? todo.activeForm : todo.content;
        core.info(`  ${status} ${index + 1}. ${text}`);
      });
    }
  }
}

// Singleton instance for use across the action
export const todoManager = new TodoManager();
