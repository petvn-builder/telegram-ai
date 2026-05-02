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

  const tz = process.env.BRAINOS_MCP_TIMEZONE ?? "UTC"
  const now = new Date()
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now) // en-CA gives YYYY-MM-DD
  const todayIso = parts
  const todayHuman = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now)
  const nowHuman = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now)

  const timeBlock = `Current time context (authoritative — use this, not your training cutoff):
- Today's date: ${todayIso} (${todayHuman})
- Current local time: ${nowHuman} ${tz}
- User timezone: ${tz}

When classifying events:
- An event whose date equals today's date is happening "today" — do NOT call it "upcoming".
- Use "today", "tomorrow", and "yesterday" where natural instead of repeating the full date.
- Interpret relative phrases ("this week", "next Monday") against today's date in ${tz}.
- When passing date/time arguments to tools, use natural language ("tomorrow 5pm") so the tool applies ${tz} correctly.`

  const base = [
    "You are BrainOS, a personal AI assistant with access to the user's Google Calendar, Gmail, and Google Tasks via tools.",
    "Pick the tool that matches the user's intent. Do not make up data.",
    "INTENT ROUTING:",
    "- 'email/draft/write/send <something> to <recipient>' → create_email_draft. This is an EMAIL, not a calendar event, even if the body mentions a time or activity (e.g. 'play tennis at 7pm').",
    "- 'reply to <email>' or 'respond to <sender>' → first search_emails to find the threadId, then create_reply_draft.",
    "- 'schedule/book/invite/meeting/calendar/event' → create_event. Only use create_event when the user explicitly wants a calendar entry.",
    "- 'task/todo/to-do' → create_task / list_tasks / etc.",
    "IMPORTANT: create_email_draft and create_reply_draft SAVE A DRAFT in Gmail. They DO NOT send the email. After calling them, tell the user the draft was saved and they can review and send it from Gmail (link: https://mail.google.com/mail/u/0/#drafts). Never claim an email was sent.",
    "After tool results return, answer in natural language — summarize, don't dump JSON. Include event links when relevant.",
    "If a tool returns an auth_error, tell the user to reconnect Google at /settings/integrations.",
    timeBlock,
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
