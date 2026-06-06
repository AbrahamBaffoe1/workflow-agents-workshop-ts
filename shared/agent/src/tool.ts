/**
 * Tool authoring helpers.
 *
 *   - `defineTool()`      a local tool (name, schema, handler) — no lifecycle.
 *   - `defineMcpSource()` an MCP server as a ToolSource — connects on resolve,
 *     exposes its tools (namespaced `<id>__<tool>`), and closes afterward.
 *
 * MCP support is opt-in: `@modelcontextprotocol/sdk` is an optionalDependency and
 * is imported lazily (via a non-literal specifier) so the base package neither
 * requires it nor fails to typecheck without it.
 */
import type { Tool, ToolResult, ToolSource } from './types.js'

export function defineTool(tool: Tool): Tool {
  return tool
}

export interface McpSourceSpec {
  /** Registry id; also the namespace prefix for this server's tools. */
  id: string
  /** Stdio transport: a command to spawn the MCP server. */
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** Or an HTTP/SSE transport URL. */
  url?: string
}

// Lazy import that the TS module resolver won't try to resolve (keeps the SDK
// optional). Returns `any` by design.
async function importOptional(specifier: string): Promise<any> {
  const dynamic: string = specifier
  return import(dynamic)
}

export function defineMcpSource(spec: McpSourceSpec): ToolSource {
  return {
    id: spec.id,
    async resolve() {
      const { Client } = await importOptional('@modelcontextprotocol/sdk/client/index.js')

      let transport: unknown
      if (spec.url) {
        const { SSEClientTransport } = await importOptional(
          '@modelcontextprotocol/sdk/client/sse.js',
        )
        transport = new SSEClientTransport(new URL(spec.url))
      } else if (spec.command) {
        const { StdioClientTransport } = await importOptional(
          '@modelcontextprotocol/sdk/client/stdio.js',
        )
        transport = new StdioClientTransport({
          command: spec.command,
          args: spec.args ?? [],
          ...(spec.env ? { env: spec.env } : {}),
        })
      } else {
        throw new Error(`MCP source "${spec.id}" needs either a url or a command`)
      }

      const client = new Client({ name: 'workshop-agent', version: '1.0.0' }, { capabilities: {} })
      await client.connect(transport)

      const listed = await client.listTools()
      const tools: Tool[] = (listed.tools as McpToolInfo[]).map((t) => ({
        name: `${spec.id}__${t.name}`,
        description: t.description ?? '',
        inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: 'object' },
        async invoke(input: unknown): Promise<ToolResult> {
          const res = await client.callTool({
            name: t.name,
            arguments: (input ?? {}) as Record<string, unknown>,
          })
          return { content: mcpContentToText(res.content), ...(res.isError ? { isError: true } : {}) }
        },
      }))

      return {
        tools,
        async close() {
          await client.close()
        },
      }
    },
  }
}

interface McpToolInfo {
  name: string
  description?: string
  inputSchema?: unknown
}

function mcpContentToText(content: unknown): string {
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        const b = block as { type?: string; text?: string }
        return b.type === 'text' && typeof b.text === 'string' ? b.text : JSON.stringify(block)
      })
      .join('\n')
  }
  return typeof content === 'string' ? content : JSON.stringify(content)
}
