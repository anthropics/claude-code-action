import { readFile } from "fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Options as SdkOptions } from "@anthropic-ai/claude-agent-sdk";

export const LIST_TOOLS_TIMEOUT_MS = 30_000;

type McpServerConfig = {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
};

type Env = Record<string, string | undefined>;

/**
 * Normalize a server or tool name the way Claude Code does when it builds
 * `mcp__<server>__<tool>` names: characters outside [a-zA-Z0-9_-] become `_`.
 */
export function normalizeMcpName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Expand `${VAR}` and `${VAR:-default}` the way Claude Code does for
 * --mcp-config values. Unset variables without a default are left as-is.
 */
export function expandEnvVars(value: string, env: Env): string {
  return value.replace(
    /\$\{([^}:]+)(?::-([^}]*))?\}/g,
    (match, name: string, fallback: string | undefined) =>
      env[name] ?? fallback ?? match,
  );
}

function expandValues(
  values: Record<string, string>,
  env: Env,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      expandEnvVars(value, env),
    ]),
  );
}

/**
 * Read the servers of a --mcp-config value (inline JSON or a file path).
 */
export async function loadMcpServers(
  mcpConfig: string,
): Promise<Record<string, McpServerConfig>> {
  const trimmed = mcpConfig.trim();
  const json = trimmed.startsWith("{")
    ? trimmed
    : await readFile(trimmed, "utf-8");
  const parsed = JSON.parse(json) as {
    mcpServers?: Record<string, McpServerConfig>;
  };
  return parsed.mcpServers ?? {};
}

/**
 * Whether allowedTools names some, but not all, of a server's tools.
 * Servers allowed as a whole (`mcp__server` or `mcp__server__*`) and servers
 * that allowedTools does not mention are left alone.
 */
function isPartlyAllowed(server: string, allowedTools: string[]): boolean {
  const prefix = `mcp__${normalizeMcpName(server)}`;
  if (allowedTools.includes(prefix) || allowedTools.includes(`${prefix}__*`)) {
    return false;
  }
  return allowedTools.some((tool) => tool.startsWith(`${prefix}__`));
}

/**
 * Whether an allowedTools entry matches a tool name. `*` in an MCP entry
 * (e.g. `mcp__github__get_*`) matches any run of characters.
 */
function matchesAllowedTool(rule: string, name: string): boolean {
  if (!rule.includes("*")) return rule === name;
  const pattern = rule
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}$`).test(name);
}

/**
 * Return the tools of every partly allowed server that allowedTools does not list.
 */
export function findUnlistedMcpTools(
  allowedTools: string[],
  serverTools: Record<string, string[]>,
): string[] {
  const mcpRules = allowedTools.filter((tool) => tool.startsWith("mcp__"));
  const unlisted: string[] = [];
  for (const [server, tools] of Object.entries(serverTools)) {
    if (!isPartlyAllowed(server, allowedTools)) continue;
    const prefix = `mcp__${normalizeMcpName(server)}`;
    for (const tool of tools) {
      const name = `${prefix}__${normalizeMcpName(tool)}`;
      if (!mcpRules.some((rule) => matchesAllowedTool(rule, name))) {
        unlisted.push(name);
      }
    }
  }
  return unlisted;
}

function createTransport(config: McpServerConfig, env: Env): Transport {
  if (config.type === "http" || config.type === "sse") {
    if (!config.url) throw new Error("no url configured");
    const url = new URL(expandEnvVars(config.url, env));
    const requestInit = { headers: expandValues(config.headers ?? {}, env) };
    return config.type === "http"
      ? new StreamableHTTPClientTransport(url, { requestInit })
      : new SSEClientTransport(url, { requestInit });
  }
  if (config.type !== undefined && config.type !== "stdio") {
    throw new Error(`unsupported server type "${config.type}"`);
  }
  if (!config.command) throw new Error("no command configured");
  const processEnv = Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  return new StdioClientTransport({
    command: expandEnvVars(config.command, env),
    args: (config.args ?? []).map((arg) => expandEnvVars(arg, env)),
    env: { ...processEnv, ...expandValues(config.env ?? {}, env) },
    stderr: "ignore",
  });
}

/**
 * Connect to an MCP server, list its tools and disconnect.
 */
export async function listMcpServerTools(
  config: McpServerConfig,
  env: Env,
  timeoutMs: number,
): Promise<string[]> {
  const transport = createTransport(config, env);
  const client = new Client({ name: "claude-code-action", version: "1.0.0" });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  const listTools = async () => {
    await client.connect(transport);
    const names: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined);
      names.push(...page.tools.map((tool) => tool.name));
      cursor = page.nextCursor;
    } while (cursor);
    return names;
  };

  try {
    return await Promise.race([listTools(), timeout]);
  } finally {
    clearTimeout(timer);
    await transport.close().catch(() => {});
  }
}

/**
 * Add the tools of each --mcp-config server that --allowedTools lists only
 * partly to disallowedTools, so their definitions are not sent to the model.
 * A server that cannot be reached is skipped with a warning.
 */
export async function disallowUnlistedMcpTools(
  sdkOptions: SdkOptions,
  timeoutMs = LIST_TOOLS_TIMEOUT_MS,
): Promise<void> {
  const mcpConfig = sdkOptions.extraArgs?.["mcp-config"];
  const allowedTools = sdkOptions.allowedTools ?? [];
  if (!mcpConfig || !allowedTools.some((tool) => tool.startsWith("mcp__"))) {
    return;
  }

  let servers: Record<string, McpServerConfig>;
  try {
    servers = await loadMcpServers(mcpConfig);
  } catch (error) {
    console.warn(
      `Could not read --mcp-config to find unlisted tools: ${error}`,
    );
    return;
  }

  const env = sdkOptions.env ?? process.env;
  const serverTools: Record<string, string[]> = {};
  await Promise.all(
    Object.entries(servers)
      .filter(([server]) => isPartlyAllowed(server, allowedTools))
      .map(async ([server, config]) => {
        try {
          serverTools[server] = await listMcpServerTools(
            config,
            env,
            timeoutMs,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : error;
          console.warn(
            `Could not list the tools of MCP server "${server}", leaving them enabled: ${message}`,
          );
        }
      }),
  );

  const unlisted = findUnlistedMcpTools(allowedTools, serverTools);
  if (unlisted.length === 0) return;

  sdkOptions.disallowedTools = [
    ...new Set([...(sdkOptions.disallowedTools ?? []), ...unlisted]),
  ];
  console.log(
    `Disallowed ${unlisted.length} MCP tools that --allowedTools does not list: ${unlisted.join(", ")}`,
  );
}
