/**
 * The tool registry — extend it by importing a module and adding a line.
 *
 * Entries are either local tools (`defineTool`) or sources with a lifecycle
 * (`defineMcpSource`). Agents reference entries by id in their `tools` array;
 * `resolveTools()` (called inside `agent.run()`) connects any sources, flattens
 * everything into the tool list the loop consumes, and returns a `close()` that
 * tears connections down.
 */
import { defineTool } from './tool.js'
import type { RegistryEntry, Tool, ToolContext } from './types.js'

const currentTime = defineTool({
  name: 'current_time',
  description: 'Get the current time as an ISO 8601 UTC string.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async invoke() {
    return { content: new Date().toISOString() }
  },
})

/**
 * Registered tools and MCP sources. To add a tool: write a module with
 * `defineTool(...)` and push it here. To add an MCP server: `defineMcpSource(...)`
 * and push it here, then list its id in an agent's `tools`.
 */
export const TOOL_REGISTRY: RegistryEntry[] = [currentTime]

const byId = (): Map<string, RegistryEntry> => new Map(TOOL_REGISTRY.map((e) => [entryId(e), e]))

export function registerTool(entry: RegistryEntry): void {
  TOOL_REGISTRY.push(entry)
}

function entryId(entry: RegistryEntry): string {
  return 'resolve' in entry ? entry.id : entry.name
}

function isSource(entry: RegistryEntry): entry is Extract<RegistryEntry, { resolve: unknown }> {
  return 'resolve' in entry
}

export interface ResolvedTools {
  tools: Tool[]
  close(): Promise<void>
}

/** Resolve declared tool/source ids into a flat tool list + a combined close(). */
export async function resolveTools(ids: readonly string[], ctx: ToolContext): Promise<ResolvedTools> {
  const registry = byId()
  const tools: Tool[] = []
  const closers: Array<() => Promise<void>> = []

  for (const id of ids) {
    const entry = registry.get(id)
    if (!entry) {
      throw new Error(`unknown tool "${id}". Registered: ${[...registry.keys()].join(', ')}`)
    }
    if (isSource(entry)) {
      const resolved = await entry.resolve(ctx)
      tools.push(...resolved.tools)
      closers.push(() => resolved.close())
    } else {
      tools.push(entry)
    }
  }

  return {
    tools,
    async close() {
      for (const close of closers) {
        await close().catch(() => {})
      }
    },
  }
}
