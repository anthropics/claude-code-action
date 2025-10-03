#!/usr/bin/env bun

import { readFileSync, existsSync } from "fs";
import { exit } from "process";

export type ToolUse = {
  type: string;
  name?: string;
  input?: Record<string, any>;
  id?: string;
};

export type ToolResult = {
  type: string;
  tool_use_id?: string;
  content?: any;
  is_error?: boolean;
};

export type ContentItem = {
  type: string;
  text?: string;
  tool_use_id?: string;
  content?: any;
  is_error?: boolean;
  name?: string;
  input?: Record<string, any>;
  id?: string;
};

export type Message = {
  content: ContentItem[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

export type Turn = {
  type: string;
  subtype?: string;
  message?: Message;
  tools?: any[];
  cost_usd?: number;
  duration_ms?: number;
  result?: string;
};

export type GroupedContent = {
  type: string;
  tools_count?: number;
  data?: Turn;
  text_parts?: string[];
  tool_calls?: { tool_use: ToolUse; tool_result?: ToolResult }[];
  usage?: Record<string, number>;
};

export function detectContentType(content: any): string {
  const contentStr = String(content).trim();

  // Check for JSON
  if (contentStr.startsWith("{") && contentStr.endsWith("}")) {
    try {
      JSON.parse(contentStr);
      return "json";
    } catch {
      // Fall through
    }
  }

  if (contentStr.startsWith("[") && contentStr.endsWith("]")) {
    try {
      JSON.parse(contentStr);
      return "json";
    } catch {
      // Fall through
    }
  }

  // Check for code-like content
  const codeKeywords = [
    "def ",
    "class ",
    "import ",
    "from ",
    "function ",
    "const ",
    "let ",
    "var ",
  ];
  if (codeKeywords.some((keyword) => contentStr.includes(keyword))) {
    if (
      contentStr.includes("def ") ||
      contentStr.includes("import ") ||
      contentStr.includes("from ")
    ) {
      return "python";
    } else if (
      ["function ", "const ", "let ", "var ", "=>"].some((js) =>
        contentStr.includes(js),
      )
    ) {
      return "javascript";
    } else {
      return "python"; // default for code
    }
  }

  // Check for shell/bash output
  const shellIndicators = ["ls -", "cd ", "mkdir ", "rm ", "$ ", "# "];
  if (
    contentStr.startsWith("/") ||
    contentStr.includes("Error:") ||
    contentStr.startsWith("total ") ||
    shellIndicators.some((indicator) => contentStr.includes(indicator))
  ) {
    return "bash";
  }

  // Check for diff format
  if (
    contentStr.startsWith("@@") ||
    contentStr.includes("+++ ") ||
    contentStr.includes("--- ")
  ) {
    return "diff";
  }

  // Check for HTML/XML
  if (contentStr.startsWith("<") && contentStr.endsWith(">")) {
    return "html";
  }

  // Check for markdown
  const mdIndicators = ["# ", "## ", "### ", "- ", "* ", "```"];
  if (mdIndicators.some((indicator) => contentStr.includes(indicator))) {
    return "markdown";
  }

  // Default to plain text
  return "text";
}

export function formatResultContent(content: any): string {
  if (!content) {
    return "*(No output)*\n\n";
  }

  let contentStr: string;

  // Check if content is a list with "type": "text" structure
  try {
    let parsedContent: any;
    if (typeof content === "string") {
      parsedContent = JSON.parse(content);
    } else {
      parsedContent = content;
    }

    if (
      Array.isArray(parsedContent) &&
      parsedContent.length > 0 &&
      typeof parsedContent[0] === "object" &&
      parsedContent[0]?.type === "text"
    ) {
      // Extract the text field from the first item
      contentStr = parsedContent[0]?.text || "";
    } else {
      contentStr = String(content).trim();
    }
  } catch {
    contentStr = String(content).trim();
  }

  // Truncate very long results
  if (contentStr.length > 3000) {
    contentStr = contentStr.substring(0, 2997) + "...";
  }

  // Detect content type
  const contentType = detectContentType(contentStr);

  // Handle JSON content specially - pretty print it
  if (contentType === "json") {
    try {
      // Try to parse and pretty print JSON
      const parsed = JSON.parse(contentStr);
      contentStr = JSON.stringify(parsed, null, 2);
    } catch {
      // Keep original if parsing fails
    }
  }

  // Format with appropriate syntax highlighting
  if (
    contentType === "text" &&
    contentStr.length < 100 &&
    !contentStr.includes("\n")
  ) {
    // Short text results don't need code blocks
    return `**→** ${contentStr}\n\n`;
  } else {
    return `**Result:**\n\`\`\`${contentType}\n${contentStr}\n\`\`\`\n\n`;
  }
}

export function formatToolWithResult(
  toolUse: ToolUse,
  toolResult?: ToolResult,
): string {
  const toolName = toolUse.name || "unknown_tool";
  const toolInput = toolUse.input || {};

  let result = `### 🔧 \`${toolName}\`\n\n`;

  // Add parameters if they exist and are not empty
  if (Object.keys(toolInput).length > 0) {
    result += "**Parameters:**\n```json\n";
    result += JSON.stringify(toolInput, null, 2);
    result += "\n```\n\n";
  }

  // Add result if available
  if (toolResult) {
    const content = toolResult.content || "";
    const isError = toolResult.is_error || false;

    if (isError) {
      result += `❌ **Error:** \`${content}\`\n\n`;
    } else {
      result += formatResultContent(content);
    }
  }

  return result;
}

export function groupTurnsNaturally(data: Turn[]): GroupedContent[] {
  const groupedContent: GroupedContent[] = [];
  const toolResultsMap = new Map<string, ToolResult>();

  // First pass: collect all tool results by tool_use_id
  for (const turn of data) {
    if (turn.type === "user") {
      const content = turn.message?.content || [];
      for (const item of content) {
        if (item.type === "tool_result" && item.tool_use_id) {
          toolResultsMap.set(item.tool_use_id, {
            type: item.type,
            tool_use_id: item.tool_use_id,
            content: item.content,
            is_error: item.is_error,
          });
        }
      }
    }
  }

  // Second pass: process turns and group naturally
  for (const turn of data) {
    const turnType = turn.type || "unknown";

    if (turnType === "system") {
      const subtype = turn.subtype || "";
      if (subtype === "init") {
        const tools = turn.tools || [];
        groupedContent.push({
          type: "system_init",
          tools_count: tools.length,
        });
      } else {
        groupedContent.push({
          type: "system_other",
          data: turn,
        });
      }
    } else if (turnType === "assistant") {
      const message = turn.message || { content: [] };
      const content = message.content || [];
      const usage = message.usage || {};

      // Process content items
      const textParts: string[] = [];
      const toolCalls: { tool_use: ToolUse; tool_result?: ToolResult }[] = [];

      for (const item of content) {
        const itemType = item.type || "";

        if (itemType === "text") {
          textParts.push(item.text || "");
        } else if (itemType === "tool_use") {
          const toolUseId = item.id;
          const toolResult = toolUseId
            ? toolResultsMap.get(toolUseId)
            : undefined;
          toolCalls.push({
            tool_use: {
              type: item.type,
              name: item.name,
              input: item.input,
              id: item.id,
            },
            tool_result: toolResult,
          });
        }
      }

      if (textParts.length > 0 || toolCalls.length > 0) {
        groupedContent.push({
          type: "assistant_action",
          text_parts: textParts,
          tool_calls: toolCalls,
          usage: usage,
        });
      }
    } else if (turnType === "user") {
      // Handle user messages that aren't tool results
      const message = turn.message || { content: [] };
      const content = message.content || [];
      const textParts: string[] = [];

      for (const item of content) {
        if (item.type === "text") {
          textParts.push(item.text || "");
        }
      }

      if (textParts.length > 0) {
        groupedContent.push({
          type: "user_message",
          text_parts: textParts,
        });
      }
    } else if (turnType === "result") {
      groupedContent.push({
        type: "final_result",
        data: turn,
      });
    }
  }

  return groupedContent;
}

export function formatGroupedContent(groupedContent: GroupedContent[]): string {
  let markdown = "## Claude Code Report\n\n";

  for (const item of groupedContent) {
    const itemType = item.type;

    if (itemType === "system_init") {
      markdown += `## 🚀 System Initialization\n\n**Available Tools:** ${item.tools_count} tools loaded\n\n---\n\n`;
    } else if (itemType === "system_other") {
      markdown += `## ⚙️ System Message\n\n${JSON.stringify(item.data, null, 2)}\n\n---\n\n`;
    } else if (itemType === "assistant_action") {
      // Add text content first (if any) - no header needed
      for (const text of item.text_parts || []) {
        if (text.trim()) {
          markdown += `${text}\n\n`;
        }
      }

      // Add tool calls with their results
      for (const toolCall of item.tool_calls || []) {
        markdown += formatToolWithResult(
          toolCall.tool_use,
          toolCall.tool_result,
        );
      }

      // Add usage info if available
      const usage = item.usage || {};
      if (Object.keys(usage).length > 0) {
        const inputTokens = usage.input_tokens || 0;
        const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
        const cacheReadTokens = usage.cache_read_input_tokens || 0;
        const totalInputTokens =
          inputTokens + cacheCreationTokens + cacheReadTokens;
        const outputTokens = usage.output_tokens || 0;
        markdown += `*Token usage: ${totalInputTokens} input, ${outputTokens} output*\n\n`;
      }

      // Only add separator if this section had content
      if (
        (item.text_parts && item.text_parts.length > 0) ||
        (item.tool_calls && item.tool_calls.length > 0)
      ) {
        markdown += "---\n\n";
      }
    } else if (itemType === "user_message") {
      markdown += "## 👤 User\n\n";
      for (const text of item.text_parts || []) {
        if (text.trim()) {
          markdown += `${text}\n\n`;
        }
      }
      markdown += "---\n\n";
    } else if (itemType === "final_result") {
      const data = item.data || {};
      const cost = (data as any).total_cost_usd || (data as any).cost_usd || 0;
      const duration = (data as any).duration_ms || 0;
      const resultText = (data as any).result || "";

      markdown += "## ✅ Final Result\n\n";
      if (resultText) {
        markdown += `${resultText}\n\n`;
      }
      markdown += `**Cost:** $${cost.toFixed(4)} | **Duration:** ${(duration / 1000).toFixed(1)}s\n\n`;
    }
  }

  return markdown;
}

export function formatTurnsFromData(data: Turn[]): string {
  // Group turns naturally
  const groupedContent = groupTurnsNaturally(data);

  // Generate markdown
  const markdown = formatGroupedContent(groupedContent);

  return markdown;
}

function main(): void {
  // Get the JSON file path from command line arguments
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: format-turns.ts <json-file>");
    exit(1);
  }

  const jsonFile = args[0];
  if (!jsonFile) {
    console.error("Error: No JSON file provided");
    exit(1);
  }

  if (!existsSync(jsonFile)) {
    console.error(`Error: ${jsonFile} not found`);
    exit(1);
  }

  try {
    // Read the JSON file
    const fileContent = readFileSync(jsonFile, "utf-8");
    const data: Turn[] = JSON.parse(fileContent);

    // Group turns naturally
    const groupedContent = groupTurnsNaturally(data);

    // Generate markdown
    const markdown = formatGroupedContent(groupedContent);

    // Print to stdout (so it can be captured by shell)
    console.log(markdown);
  } catch (error) {
    console.error(`Error processing file: ${error}`);
    exit(1);
  }
}

if (import.meta.main) {
  main();
}
