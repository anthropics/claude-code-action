import { describe, test, expect } from "bun:test";
import {
  createTodoList,
  mergeTodoLists,
  type TodoItem,
} from "../src/utils/todo-persistence";

describe("Todo Persistence", () => {
  const sampleTodos: TodoItem[] = [
    {
      content: "Implement authentication",
      status: "completed",
      activeForm: "Implementing authentication",
    },
    {
      content: "Add database migrations",
      status: "in_progress",
      activeForm: "Adding database migrations",
    },
    {
      content: "Write unit tests",
      status: "pending",
      activeForm: "Writing unit tests",
    },
  ];

  test("createTodoList creates a valid todo list", () => {
    const todoList = createTodoList(sampleTodos);

    expect(todoList.todos).toEqual(sampleTodos);
    expect(todoList.version).toBe(1);
    expect(todoList.lastUpdated).toBeDefined();
    expect(todoList.runId).toBeDefined();
  });

  test("createTodoList handles empty todos", () => {
    const todoList = createTodoList([]);

    expect(todoList.todos).toEqual([]);
    expect(todoList.version).toBe(1);
  });

  test("mergeTodoLists preserves existing status", () => {
    const existing = createTodoList([
      {
        content: "Implement authentication",
        status: "completed",
        activeForm: "Implementing authentication",
      },
      {
        content: "Add database migrations",
        status: "in_progress",
        activeForm: "Adding database migrations",
      },
    ]);

    const newTodos: TodoItem[] = [
      {
        content: "Implement authentication",
        status: "pending",
        activeForm: "Implementing authentication",
      },
      {
        content: "Write unit tests",
        status: "pending",
        activeForm: "Writing unit tests",
      },
    ];

    const merged = mergeTodoLists(existing, newTodos);

    // Should preserve completed status from existing
    expect(
      merged.todos.find((t) => t.content === "Implement authentication")
        ?.status,
    ).toBe("completed");

    // Should add new todo
    expect(
      merged.todos.find((t) => t.content === "Write unit tests")?.status,
    ).toBe("pending");

    // Should preserve version info
    expect(merged.version).toBe(existing.version);
  });

  test("mergeTodoLists handles null existing list", () => {
    const newTodos: TodoItem[] = [
      {
        content: "New task",
        status: "pending",
        activeForm: "Working on new task",
      },
    ];

    const merged = mergeTodoLists(null, newTodos);

    expect(merged.todos).toEqual(newTodos);
    expect(merged.version).toBe(1);
  });

  test("mergeTodoLists preserves completed tasks not in new list", () => {
    const existing = createTodoList([
      {
        content: "Old completed task",
        status: "completed",
        activeForm: "Working on old completed task",
      },
      {
        content: "Task in progress",
        status: "in_progress",
        activeForm: "Working on task in progress",
      },
    ]);

    const newTodos: TodoItem[] = [
      {
        content: "New task",
        status: "pending",
        activeForm: "Working on new task",
      },
    ];

    const merged = mergeTodoLists(existing, newTodos);

    // Should keep completed task from existing
    expect(
      merged.todos.find((t) => t.content === "Old completed task")?.status,
    ).toBe("completed");

    // Should not keep non-completed task that's not in new list
    expect(
      merged.todos.find((t) => t.content === "Task in progress"),
    ).toBeUndefined();

    // Should have the new task
    expect(merged.todos.find((t) => t.content === "New task")?.status).toBe(
      "pending",
    );
  });
});
