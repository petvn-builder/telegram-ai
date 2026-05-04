import OpenAI from "openai"
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions"
import { openaiTools, executeTool } from "./tools"
import type { OpenAiToolDescriptor } from "@/mcp/tool-registry"
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
  tools?: OpenAiToolDescriptor[]
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

  const dayFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" })
  const upcomingDays: string[] = []
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getTime() + i * 86_400_000)
    const label = i === 0 ? "today" : i === 1 ? "tomorrow" : `+${i}d`
    upcomingDays.push(`${weekdayFmt.format(d)} ${dayFmt.format(d)}${i <= 1 ? ` (${label})` : ""}`)
  }

  const timeBlock = `Current time context (authoritative — use this, not your training cutoff):
- Today's date: ${todayIso} (${todayHuman})
- Current local time: ${nowHuman} ${tz}
- User timezone: ${tz}
- Next 14 days (use this table for ALL weekday↔date mapping — never compute weekdays yourself):
  ${upcomingDays.join(", ")}

When classifying events:
- An event whose date equals today's date is happening "today" — do NOT call it "upcoming".
- Use "today", "tomorrow", and "yesterday" where natural instead of repeating the full date.
- Interpret relative phrases ("this week", "next Monday", "this weekend") against today's date in ${tz}, and resolve them using the 14-day table above. "This weekend" = the next upcoming Sat+Sun in that table.
- Never name a weekday from a date unless that pairing appears in the table above. If a date is outside the 14-day window, state the ISO date only or call a tool to resolve it.
- When passing date/time arguments to tools, use natural language ("tomorrow 5pm", "this Saturday 7pm") so the tool applies ${tz} correctly.
- For weekend/free-time planning, you MUST call find_free_time with the natural-language window (e.g. "this Saturday evening") rather than inferring availability from get_events output alone.`

  const base = [
    "You are BrainOS, a personal AI assistant with access to the user's Google Calendar, Gmail, Google Tasks, and personal knowledge base via tools.",
    "Pick the tool that matches the user's intent. Do not make up data.",
    `GROUNDING RULE (read first):
You have NO prior knowledge of this user's life, work, people, decisions, plans, preferences, or history.
For ANY question that references the user's personal context — phrases like "my", "I", named people/projects, past events, or anything that would require knowing this specific user — you MUST call a data tool before answering:
  - search_notes  → for recall, summarization, "what did I write about X", anything about the user's notes/people/projects/decisions
  - find_free_time / get_events  → for the user's schedule
  - search_emails / get_thread  → for the user's email
  - list_tasks  → for the user's tasks
Only answer without calling a tool for: greetings, general-knowledge questions ("what's the capital of France"), clarifying questions back to the user, or follow-ups where a prior tool result already contains the answer.
If unsure whether a question is personal, call search_notes — it is cheap and the right default.`,
    `ANSWERING FROM search_notes:
The search_notes tool returns raw note excerpts in a 'context' field plus 'sources'. When answering from those excerpts:
- Quote or paraphrase directly from the returned context. Preserve concrete details (dates, times, names, prices, places) verbatim.
- Match the language and script of the notes (if the user's notes are in Vietnamese, answer in Vietnamese).
- Do NOT supplement with general knowledge. If the user asks "tell me about X" and the context covers a specific aspect (e.g. an itinerary), answer about THAT — not generic facts about X.
- If the context is empty, says "(no relevant notes found)", or doesn't actually address the question, say so plainly: tell the user what you found (or didn't) and ask a clarifying question. Never invent details to fill gaps.
- Citing a source while ignoring its content is a bug. If you reference a source, your answer must be based on its content.`,
    "INTENT ROUTING:",
    "- 'recall / summarize / what did I write about / notes about X / who is / what's the status of' → search_notes.",
    "- 'when can I / am I free / find time for / what's my schedule' → find_free_time or get_events.",
    "- 'email/draft/write/send <something> to <recipient>' → create_email_draft. This is an EMAIL, not a calendar event, even if the body mentions a time or activity (e.g. 'play tennis at 7pm').",
    "- 'reply to <email>' or 'respond to <sender>' → first search_emails to find the threadId, then create_reply_draft.",
    "- 'schedule/book/invite/meeting/calendar/event' → create_event. Only use create_event when the user explicitly wants a calendar entry.",
    "- 'task/todo/to-do' → create_task / list_tasks / etc.",
    `EMAIL TRIAGE — when the user asks for emails that "need reply", "to reply to", "to read", "to triage", or "in my inbox" without naming a sender:
- "Needs reply" means a human wrote to the user and is waiting on a response. Transactional, automated, and bulk mail do NOT need a reply.
- Build the search_emails query as: \`in:inbox is:unread -category:promotions -category:social -category:updates -category:forums -from:noreply -from:no-reply -from:notifications -from:notification -from:mailer-daemon -from:postmaster -subject:(receipt OR invoice OR statement OR "transaction notice" OR "delivery status") newer_than:30d\`. Adapt (drop newer_than for "all time", add from: when the user names a sender).
- Over-fetch: pass maxResults = 2× the user's requested count (e.g. 20 for "top 10"), so post-filtering still leaves enough.
- Post-filter the returned messages and DROP any where:
  • sender address looks automated (noreply, no-reply, notifications, mailer-daemon, postmaster, support@, alerts@, *-bounces@)
  • subject matches transactional patterns (Transaction Notice, Receipt, Biên lai, Delivery Status Notification, Statement, Invoice, Your order, Payment confirmation, debit/credit notice)
  • sender domain is a known marketing/newsletter source (klook, indiehackers, vidiq, substack, mailchimp, sendgrid, *.marketing.*) or subject is promo-style (leading emoji + sales language)
  • the snippet is clearly one-way broadcast (no question, no ask, no addressed greeting)
- If fewer than the requested count remain after filtering, return only the real ones and say so explicitly (e.g. "Found 3 that look like they need a reply — the rest of your unread inbox is transactional/promotional"). Never pad the list with mail you just filtered out.
- If the user explicitly asks to include promotions/newsletters/all unread, skip the triage filter and just list.`,
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
  const tools = input.tools ?? openaiTools

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
      tools,
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
