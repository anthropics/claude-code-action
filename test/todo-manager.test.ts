import { describe, test, expect, beforeEach, mock } from "bun:test";
import { TodoManager } from "../src/utils/todo-manager";

// Mock the artifact and file system dependencies
const mockDownloadArtifact = mock();
const mockUploadArtifact = mock();
const mockWriteFile = mock();
const mockReadFile = mock();

// Mock environment variables
beforeEach(() => {
  process.env.RUNNER_TEMP = "/tmp";
  process.env.GITHUB_RUN_ID = "test-run-123";
  process.env.CLAUDE_TODO_PERSISTENCE_ENABLED = "true";

  // Reset mocks
  mockDownloadArtifact.mockClear();
  mockUploadArtifact.mockClear();
  mockWriteFile.mockClear();
  mockReadFile.mockClear();
});

describe("TodoManager", () => {
  test("constructor sets correct file paths", () => {
    const manager = new TodoManager();
    const paths = manager.getFilePaths();

    expect(paths.input).toBe("/tmp/claude-todo-input.json");
    expect(paths.output).toBe("/tmp/claude-todo-output.json");
  });

  test("generateTodoSummaryMarkdown formats todos correctly", () => {
    const manager = new TodoManager();

    // Set up some test todos
    manager.updateTodoList([
      {
        content: "Complete feature A",
        status: "completed",
        activeForm: "Completing feature A"
      },
      {
        content: "Work on feature B",
        status: "in_progress",
        activeForm: "Working on feature B"
      },
      {
        content: "Plan feature C",
        status: "pending",
        activeForm: "Planning feature C"
      }
    ]);

    const summary = manager.generateTodoSummaryMarkdown();

    expect(summary).toContain("### 📋 Task Progress (1/3 completed)");
    expect(summary).toContain("☑️ Complete feature A");
    expect(summary).toContain("🔄 Working on feature B");
    expect(summary).toContain("⬜ Plan feature C");
  });

  test("generateTodoSummaryMarkdown returns empty string for no todos", () => {
    const manager = new TodoManager();
    const summary = manager.generateTodoSummaryMarkdown();
    expect(summary).toBe("");
  });
});
