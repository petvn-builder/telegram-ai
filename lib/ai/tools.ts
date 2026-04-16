import { registry, toOpenAiTool, getTool } from "@/mcp/tool-registry"
import { ToolError } from "@/mcp/shared/errors"

export const openaiTools = registry.map(toOpenAiTool)

export type ExecuteResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; code?: string }

export async function executeTool(
  name: string,
  rawArgs: unknown,
  ctx: { userId: string }
): Promise<ExecuteResult> {
  const tool = getTool(name)
  if (!tool) return { ok: false, error: `Unknown tool: ${name}`, code: "unknown_tool" }

  try {
    const args = tool.inputSchema.parse(rawArgs ?? {})
    const data = await tool.handler(args, ctx)
    console.log("[tool]", JSON.stringify({ tool: name, userId: ctx.userId, ok: true }))
    return { ok: true, data }
  } catch (e) {
    if (e instanceof ToolError) {
      console.warn("[tool]", JSON.stringify({ tool: name, userId: ctx.userId, ok: false, code: e.code }))
      return { ok: false, error: e.message, code: e.code }
    }
    const msg = e instanceof Error ? e.message : String(e)
    console.warn("[tool]", JSON.stringify({ tool: name, userId: ctx.userId, ok: false, code: "invalid_args" }))
    return { ok: false, error: msg, code: "invalid_args" }
  }
}

export async function userHasGoogle(userId: string): Promise<boolean> {
  const { loadTokens } = await import("@/lib/google/token-store")
  try {
    const t = await loadTokens(userId)
    return !!t
  } catch {
    return false
  }
}
