#!/usr/bin/env node
/**
 * Standalone stdio MCP server exposing BrainOS's Google (Calendar + Gmail)
 * tools. Intended to be spawned by Claude Desktop / MCP Inspector.
 *
 *   node --env-file=.env.local --import tsx mcp/server.ts
 *   # or, from npm:
 *   npm run mcp:serve     (reads env from the caller/shell)
 *
 * Required env:
 *   BRAINOS_MCP_USER_ID      Supabase user.id whose Google tokens to use
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
 *   GOOGLE_TOKEN_ENCRYPTION_KEY
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { registry, toMcpTool, getTool } from "./tool-registry"
import { ToolError } from "./shared/errors"

const userId = process.env.BRAINOS_MCP_USER_ID
if (!userId) {
  console.error("BRAINOS_MCP_USER_ID is required to run the stdio MCP server.")
  process.exit(1)
}
const timeZone = process.env.BRAINOS_MCP_TIMEZONE ?? "UTC"

const server = new Server(
  { name: "brainos-google", version: "0.1.0" },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: registry.map(toMcpTool),
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = getTool(req.params.name)
  if (!tool) {
    return {
      isError: true,
      content: [{ type: "text", text: `unknown tool: ${req.params.name}` }],
    }
  }
  try {
    const args = tool.inputSchema.parse(req.params.arguments ?? {})
    const result = await tool.handler(args, { userId, timeZone })
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
  } catch (e) {
    const msg = e instanceof ToolError ? `[${e.code}] ${e.message}` : e instanceof Error ? e.message : String(e)
    return { isError: true, content: [{ type: "text", text: msg }] }
  }
})

await server.connect(new StdioServerTransport())
console.error("[brainos-google] MCP server listening on stdio")
