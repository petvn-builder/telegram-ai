import { z, ZodType } from "zod"
import { calendarTools } from "./calendar"
import { gmailTools } from "./gmail"

export interface UserContext {
  userId: string
}

export interface ToolDef<TIn extends ZodType = ZodType, TOut = unknown> {
  name: string
  description: string
  inputSchema: TIn
  handler: (args: z.infer<TIn>, ctx: UserContext) => Promise<TOut>
}

export function defineTool<TIn extends ZodType, TOut>(def: ToolDef<TIn, TOut>): ToolDef<TIn, TOut> {
  return def
}

// Registry of every tool exposed by this server.
export const registry: ToolDef[] = [...calendarTools, ...gmailTools] as unknown as ToolDef[]

export function getTool(name: string): ToolDef | undefined {
  return registry.find((t) => t.name === name)
}

// ── Adapters ────────────────────────────────────────────────────────────────

interface JsonSchemaObject {
  type?: string
  properties?: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean | object
  [k: string]: unknown
}

function inputJsonSchema(t: ToolDef): JsonSchemaObject {
  // zod v4 native — produces JSON Schema draft 2020-12.
  const schema = z.toJSONSchema(t.inputSchema) as JsonSchemaObject
  // Ensure an object at the top for MCP/OpenAI.
  if (!schema.type) schema.type = "object"
  return schema
}

export interface McpToolDescriptor {
  name: string
  description: string
  inputSchema: JsonSchemaObject
}

export function toMcpTool(t: ToolDef): McpToolDescriptor {
  return {
    name: t.name,
    description: t.description,
    inputSchema: inputJsonSchema(t),
  }
}

export interface OpenAiToolDescriptor {
  type: "function"
  function: {
    name: string
    description: string
    parameters: JsonSchemaObject
  }
}

export function toOpenAiTool(t: ToolDef): OpenAiToolDescriptor {
  return {
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: inputJsonSchema(t),
    },
  }
}
