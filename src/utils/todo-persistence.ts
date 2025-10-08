import * as core from "@actions/core";
import * as artifact from "@actions/artifact";
import { writeFile, readFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

export type TodoItem = {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm: string;
};

export type TodoList = {
  todos: TodoItem[];
  version: number;
  lastUpdated: string;
  runId: string;
};

const ARTIFACT_NAME = "claude-todo-list";
const TODO_FILENAME = "todo-list.json";

/**
 * Downloads the todo list artifact from previous runs
 * Returns null if no artifact exists or on error
 */
export async function downloadTodoListArtifact(): Promise<TodoList | null> {
  try {
    const artifactClient = artifact.create();
    const downloadDir = join(process.env.RUNNER_TEMP || "/tmp", "todo-artifacts");

    // Ensure download directory exists
    if (!existsSync(downloadDir)) {
      await mkdir(downloadDir, { recursive: true });
    }

    // Try to download the artifact
    const downloadResult = await artifactClient.downloadArtifact(
      ARTIFACT_NAME,
      downloadDir
    );

    if (!downloadResult || !downloadResult.downloadPath) {
      core.info("No todo list artifact found from previous runs");
      return null;
    }

    const todoFilePath = join(downloadResult.downloadPath, TODO_FILENAME);

    if (!existsSync(todoFilePath)) {
      core.warning("Todo list artifact downloaded but file not found");
      return null;
    }

    const todoData = await readFile(todoFilePath, "utf-8");
    const todoList: TodoList = JSON.parse(todoData);

    core.info(`Downloaded todo list with ${todoList.todos.length} items (v${todoList.version})`);
    return todoList;
  } catch (error) {
    core.warning(`Failed to download todo list artifact: ${error}`);
    return null;
  }
}

/**
 * Uploads the todo list as an artifact for future runs
 */
export async function uploadTodoListArtifact(todoList: TodoList): Promise<void> {
  try {
    const artifactClient = artifact.create();
    const uploadDir = join(process.env.RUNNER_TEMP || "/tmp", "todo-upload");

    // Ensure upload directory exists
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const todoFilePath = join(uploadDir, TODO_FILENAME);

    // Update metadata
    const updatedTodoList: TodoList = {
      ...todoList,
      version: todoList.version + 1,
      lastUpdated: new Date().toISOString(),
      runId: process.env.GITHUB_RUN_ID || "unknown"
    };

    // Write todo list to file
    await writeFile(todoFilePath, JSON.stringify(updatedTodoList, null, 2));

    // Upload artifact
    const uploadResult = await artifactClient.uploadArtifact(
      ARTIFACT_NAME,
      [todoFilePath],
      uploadDir,
      {
        continueOnError: true,
        retentionDays: 30 // Keep artifacts for 30 days
      }
    );

    if (uploadResult.failedItems.length > 0) {
      core.warning(`Failed to upload ${uploadResult.failedItems.length} items`);
    } else {
      core.info(`Successfully uploaded todo list artifact (v${updatedTodoList.version})`);
    }
  } catch (error) {
    core.warning(`Failed to upload todo list artifact: ${error}`);
  }
}

/**
 * Creates a new todo list with provided items
 */
export function createTodoList(todos: TodoItem[]): TodoList {
  return {
    todos: todos || [],
    version: 1,
    lastUpdated: new Date().toISOString(),
    runId: process.env.GITHUB_RUN_ID || "unknown"
  };
}

/**
 * Merges an existing todo list with new todos, preserving state where possible
 * Returns the merged todo list
 */
export function mergeTodoLists(existing: TodoList | null, newTodos: TodoItem[]): TodoList {
  if (!existing || existing.todos.length === 0) {
    return createTodoList(newTodos);
  }

  // Create a map of existing todos by content for quick lookup
  const existingTodoMap = new Map<string, TodoItem>();
  existing.todos.forEach(todo => {
    existingTodoMap.set(todo.content, todo);
  });

  // Process new todos, preserving status from existing where possible
  const mergedTodos: TodoItem[] = newTodos.map(newTodo => {
    const existingTodo = existingTodoMap.get(newTodo.content);
    if (existingTodo) {
      // Preserve the status from existing todo, but update activeForm if needed
      return {
        ...existingTodo,
        activeForm: newTodo.activeForm // Update activeForm in case it changed
      };
    }
    return newTodo;
  });

  // Add any completed todos from existing list that aren't in new list
  existing.todos.forEach(existingTodo => {
    if (existingTodo.status === "completed" &&
        !newTodos.some(newTodo => newTodo.content === existingTodo.content)) {
      mergedTodos.push(existingTodo);
    }
  });

  return {
    todos: mergedTodos,
    version: existing.version,
    lastUpdated: existing.lastUpdated,
    runId: existing.runId
  };
}

/**
 * Writes the todo list to a file that Claude can access
 */
export async function writeTodoListForClaude(todoList: TodoList, filePath: string): Promise<void> {
  try {
    const claudeTodoData = {
      todos: todoList.todos,
      metadata: {
        version: todoList.version,
        lastUpdated: todoList.lastUpdated,
        runId: todoList.runId,
        totalTodos: todoList.todos.length,
        completedTodos: todoList.todos.filter(t => t.status === "completed").length,
        inProgressTodos: todoList.todos.filter(t => t.status === "in_progress").length,
        pendingTodos: todoList.todos.filter(t => t.status === "pending").length
      }
    };

    await writeFile(filePath, JSON.stringify(claudeTodoData, null, 2));
    core.info(`Written todo list for Claude to ${filePath}`);
  } catch (error) {
    core.warning(`Failed to write todo list for Claude: ${error}`);
  }
}

/**
 * Reads the updated todo list from Claude's output
 */
export async function readTodoListFromClaude(filePath: string): Promise<TodoItem[] | null> {
  try {
    if (!existsSync(filePath)) {
      return null;
    }

    const data = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(data);

    // Handle both formats - direct todos array or wrapped in metadata
    if (Array.isArray(parsed)) {
      return parsed as TodoItem[];
    } else if (parsed.todos && Array.isArray(parsed.todos)) {
      return parsed.todos as TodoItem[];
    }

    return null;
  } catch (error) {
    core.warning(`Failed to read todo list from Claude: ${error}`);
    return null;
  }
}