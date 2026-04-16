import OpenAI from "openai"
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions"
import { openaiTools, executeTool } from "./tools"
import { TONE_PROMPTS } from "@/lib/openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export interface ChatToolEvent {
  kind: "tool_call" | "tool_result"
  name: string
  args?: unknown
  result?: unknown
  error?: string
  code?: string
}

export interface ChatWithToolsInput {
  userId: string
  userMessage: string
  system?: string
  tone?: string
  history?: Array<{ role: "user" | "assistant"; content: string }>
  maxHops?: number
  onEvent?: (e: ChatToolEvent) => void
}

export interface ChatWithToolsResult {
  text: string
  events: ChatToolEvent[]
}

function buildSystem(tone?: string, extra?: string): string {
  const toneInstruction =
    TONE_PROMPTS[(tone ?? "professional") as keyof typeof TONE_PROMPTS] ?? TONE_PROMPTS.professional
  const base = [
    "You are BrainOS, a personal AI assistant with access to the user's Google Calendar, Gmail, and Google Tasks via tools.",
    "When the user asks about their schedule, free time, emails, tasks, or wants to create/update calendar events or tasks, CALL THE APPROPRIATE TOOL. Do not make up data.",
    "After tool results return, answer in natural language — summarize, don't dump JSON. Include event links when relevant.",
    "If a tool returns an auth_error, tell the user to reconnect Google at /settings/integrations.",
    `Today is ${new Date().toISOString()}. Interpret relative times (e.g. "tomorrow", "next week") against this.`,
    toneInstruction,
  ]
  if (extra) base.push(extra)
  return base.join("\n\n")
}

export async function chatWithTools(input: ChatWithToolsInput): Promise<ChatWithToolsResult> {
  const maxHops = input.maxHops ?? 4
  const events: ChatToolEvent[] = []

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystem(input.tone, input.system) },
    ...(input.history ?? []).map(
      (m): ChatCompletionMessageParam => ({ role: m.role, content: m.content })
    ),
    { role: "user", content: input.userMessage },
  ]

  for (let hop = 0; hop < maxHops; hop++) {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: openaiTools,
      tool_choice: "auto",
    })

    const msg = resp.choices[0].message
    const toolCalls = (msg.tool_calls ?? []) as ChatCompletionMessageToolCall[]

    if (!toolCalls.length) {
      return { text: msg.content ?? "", events }
    }

    // Append the assistant message (with tool_calls) to history.
    messages.push({
      role: "assistant",
      content: msg.content ?? "",
      tool_calls: toolCalls,
    })

    for (const call of toolCalls) {
      if (call.type !== "function") continue
      let args: unknown = {}
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {}
      } catch {
        args = {}
      }

      const callEvent: ChatToolEvent = { kind: "tool_call", name: call.function.name, args }
      events.push(callEvent)
      input.onEvent?.(callEvent)

      const result = await executeTool(call.function.name, args, { userId: input.userId })

      const resultEvent: ChatToolEvent = result.ok
        ? { kind: "tool_result", name: call.function.name, result: result.data }
        : { kind: "tool_result", name: call.function.name, error: result.error, code: result.code }
      events.push(resultEvent)
      input.onEvent?.(resultEvent)

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result.ok ? result.data : { error: result.error, code: result.code }),
      })
    }
  }

  // Final hop: force a text answer without tools.
  const final = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
  })
  return { text: final.choices[0].message.content ?? "", events }
}
