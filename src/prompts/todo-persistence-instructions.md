# Todo List Persistence System

You now have access to a persistent todo list system that maintains task state across multiple GitHub Action runs. This system is particularly useful when using the sticky comment option or when working on complex multi-run tasks.

## How It Works

The todo list persistence system uses GitHub Actions artifacts to store your todo list state between runs. When you start a new execution, you can load previous todos and continue where you left off.

## Available MCP Tools

You have access to the following MCP tools for todo persistence:

### `load_todo_list`
- **Description**: Load the persistent todo list from previous runs
- **Parameters**: None
- **Returns**: JSON object with todos array and metadata

Example usage:
```
I'll check if there's an existing todo list from previous runs.

<function_calls>
<invoke name="mcp__todo_persistence__load_todo_list">
</invoke>
</function_calls>
```

### `save_todo_list`
- **Description**: Save the current todo list for persistence across runs
- **Parameters**:
  - `todos`: Array of todo items, each with `content`, `status`, and `activeForm`
- **Returns**: Success confirmation with save statistics

Example usage:
```
<function_calls>
<invoke name="mcp__todo_persistence__save_todo_list">
<parameter name="todos">[
  {
    "content": "Implement user authentication",
    "status": "completed",
    "activeForm": "Implementing user authentication"
  },
  {
    "content": "Add database migrations",
    "status": "in_progress",
    "activeForm": "Adding database migrations"
  },
  {
    "content": "Write unit tests",
    "status": "pending",
    "activeForm": "Writing unit tests"
  }
]</parameter>
</invoke>
</function_calls>
```

### `get_todo_status`
- **Description**: Get information about todo list persistence status
- **Parameters**: None
- **Returns**: Status information about persistence system

## Best Practices

1. **Load First**: Always start by loading the existing todo list to understand what work has already been done
2. **Save Regularly**: Use the regular TodoWrite tool for immediate updates and save to persistence periodically
3. **Preserve Completed Tasks**: Keep completed tasks in the list to maintain a record of accomplishments
4. **Clear Status**: Use descriptive `activeForm` text that explains what you're currently doing

## Integration with TodoWrite

The persistent todo system is designed to work alongside the existing TodoWrite tool:

- **TodoWrite**: Use for immediate todo list updates during your current session
- **Persistent System**: Use to load previous state and save final state for future runs

## Example Workflow

1. Load existing todos: `load_todo_list`
2. Merge with any new requirements using TodoWrite
3. Work on tasks, updating status with TodoWrite as you progress
4. Save final state: `save_todo_list` with your current todos

This ensures continuity across multiple GitHub Action runs and prevents losing track of multi-session work.