import OpenAI from "openai"
import type { ContextItem } from "./context"
import type { FreeSlot } from "@/mcp/shared/types"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export type BriefSection = "urgent" | "important" | "opportunity"

export type BriefActionType =
  | "reply_email"
  | "view_task"
  | "create_task"
  | "schedule_time"
  | "review_note"

export type ReplyEmailPayload = {
  threadId: string
  draft: string
  to?: string
  subject?: string
}
export type ViewTaskPayload = { taskId: string }
export type CreateTaskPayload = {
  title: string
  description?: string
  dueDate?: string
}
export type ScheduleTimePayload = {
  title: string
  duration: 30 | 60 | 90 | 120
  suggestedSlot?: string
}
export type ReviewNotePayload = { noteId: string }

export type BriefActionStep =
  | { label: string; type: "reply_email"; payload: ReplyEmailPayload }
  | { label: string; type: "view_task"; payload: ViewTaskPayload }
  | { label: string; type: "create_task"; payload: CreateTaskPayload }
  | { label: string; type: "schedule_time"; payload: ScheduleTimePayload }
  | { label: string; type: "review_note"; payload: ReviewNotePayload }

export type BriefAction = {
  itemId: string
  primary: BriefActionStep
  secondary?: BriefActionStep
  confidence: number
}

export type BriefOutput = {
  brief: string
  priorities: string[]
  sections: { urgent: string[]; important: string[]; opportunity: string[] }
  actions: BriefAction[]
}

export type GenerateBriefCtx = {
  timeZone: string
  now: string
  todayHuman: string
  freeSlots: FreeSlot[]
}

const SYSTEM = `You are an elite executive assistant producing a daily command-center brief.

Your job is NOT to summarize. Your job is to:
1. Decide what matters
2. Prepare CONCRETE next actions (drafts, task titles, time slots — not vague advice)
3. Reduce the user's effort to near zero

PRIORITIZATION ORDER:
1. Humans waiting (emails needing reply)
2. Deadlines (overdue or due today)
3. Blockers (stuck tasks)
4. Time-sensitive meetings
5. Free-time opportunities

PER-TYPE RULES:

EMAIL — if it asks a question, requires a decision, or is awaiting reply:
  → MUST emit primary: { type: "reply_email", payload: { threadId, draft, to, subject } }
  → This action SAVES a draft on the user's Gmail thread for them to review and send themselves; it does NOT send.
  → label should reflect that, e.g. "Draft reply" — never "Send reply".
  → draft is 3–6 sentences, professional, directly answers, moves the conversation forward
  → subject = original subject prefixed with "Re: " if not already
  → If the email also implies work ("can you prepare", "please send", "we need to"):
      ALSO emit secondary: { type: "create_task", payload: { title, description, dueDate? } }

TASK — overdue or due today:
  → primary: { type: "view_task", payload: { taskId } }
  → label like "Open overdue task" or "Tackle today"

TASK — undated, status next/doing:
  → primary: { type: "view_task", payload: { taskId } } (label "Prioritize")

NOTE — recent or relevant:
  → primary: { type: "review_note", payload: { noteId } } (label "Open note")

CALENDAR EVENT — happening soon or now:
  → primary: { type: "view_task", payload: { taskId: itemId } } is wrong; for events,
    prefer NO action unless prep is needed. If prep is needed, emit
    secondary: { type: "create_task", payload: { title: "Prep for <event>" } }

OPPORTUNITY (free time exists in the freeSlots payload):
  → Pick the highest-value queued task and emit
    primary: { type: "schedule_time", payload: { title, duration, suggestedSlot } }
  → suggestedSlot MUST be one of the ISO start times provided in freeSlots
  → duration must be 30, 60, 90, or 120 (clip to the slot's available minutes)

SECTIONING:
- "urgent" = needs action today (overdue, meetings imminent, time-sensitive emails)
- "important" = should be addressed this week (follow-ups, planning)
- "opportunity" = optional / nice-to-have (free time use, notes to revisit)
- Every id in sections.* and actions.itemId MUST be one of the input item ids

QUALITY BAR:
- NO vague suggestions ("consider doing X", "follow up with Y")
- ALWAYS produce concrete actions with full payloads
- Action labels are imperative and short ("Draft reply", "Create task: prep deck")
- confidence: 0.0–1.0. Only emit actions with confidence >= 0.7
- MAX 7 actions total, ordered by impact

OUTPUT — STRICT JSON:
{
  "brief": "2–4 sentence narrative, conversational, mentions today naturally",
  "priorities": ["3–5 short bullets"],
  "sections": { "urgent": [ids], "important": [ids], "opportunity": [ids] },
  "actions": [
    {
      "itemId": "string",
      "primary": { "label": "string", "type": "...", "payload": { ... } },
      "secondary": { "label": "string", "type": "...", "payload": { ... } },  // optional
      "confidence": 0.0
    }
  ]
}`

function compactItem(i: ContextItem): Record<string, unknown> {
  return {
    id: i.id,
    type: i.type,
    title: i.title,
    content: i.content?.slice(0, 280) ?? "",
    createdAt: i.createdAt,
    urgency: i.metadata?.urgency,
    requiresAction: i.metadata?.requiresAction,
    unread: i.metadata?.unread,
    dueDate: i.metadata?.dueDate,
    status: i.metadata?.status,
    threadId: i.metadata?.threadId,
    from: i.metadata?.from,
    people: i.metadata?.people?.slice(0, 3),
  }
}

function emptyBrief(): BriefOutput {
  return {
    brief: "Nothing pressing right now. Take a breath.",
    priorities: [],
    sections: { urgent: [], important: [], opportunity: [] },
    actions: [],
  }
}

function isString(x: unknown): x is string {
  return typeof x === "string" && x.length > 0
}

function isStep(raw: unknown): raw is BriefActionStep {
  if (!raw || typeof raw !== "object") return false
  const r = raw as { label?: unknown; type?: unknown; payload?: unknown }
  if (!isString(r.label) || !isString(r.type)) return false
  const p = r.payload
  if (!p || typeof p !== "object") return false
  const pp = p as Record<string, unknown>
  switch (r.type) {
    case "reply_email":
      return isString(pp.threadId) && isString(pp.draft)
    case "view_task":
      return isString(pp.taskId)
    case "create_task":
      return isString(pp.title)
    case "schedule_time":
      return (
        isString(pp.title) &&
        typeof pp.duration === "number" &&
        [30, 60, 90, 120].includes(pp.duration)
      )
    case "review_note":
      return isString(pp.noteId)
    default:
      return false
  }
}

function validateActions(
  raw: unknown,
  validIds: Set<string>
): BriefAction[] {
  if (!Array.isArray(raw)) return []
  const out: BriefAction[] = []
  for (const a of raw) {
    if (!a || typeof a !== "object") continue
    const r = a as {
      itemId?: unknown
      primary?: unknown
      secondary?: unknown
      confidence?: unknown
    }
    if (!isString(r.itemId) || !validIds.has(r.itemId)) continue
    if (typeof r.confidence !== "number" || r.confidence < 0.7) continue
    if (!isStep(r.primary)) continue
    const action: BriefAction = {
      itemId: r.itemId,
      primary: r.primary,
      confidence: r.confidence,
    }
    if (r.secondary !== undefined && isStep(r.secondary)) {
      action.secondary = r.secondary
    }
    out.push(action)
    if (out.length >= 7) break
  }
  return out
}

export async function generateBrief(
  items: ContextItem[],
  ctx: GenerateBriefCtx
): Promise<BriefOutput> {
  if (items.length === 0) return emptyBrief()

  const userPayload = {
    today: ctx.todayHuman,
    timeZone: ctx.timeZone,
    now: ctx.now,
    items: items.map(compactItem),
    freeSlots: ctx.freeSlots.map((s) => ({
      start: s.start,
      end: s.end,
      durationMinutes: s.durationMinutes,
    })),
  }

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
  })

  const raw = resp.choices[0]?.message?.content ?? "{}"
  let parsed: Partial<BriefOutput>
  try {
    parsed = JSON.parse(raw)
  } catch {
    return emptyBrief()
  }

  const validIds = new Set(items.map((i) => i.id))
  const filterIds = (arr: unknown): string[] =>
    Array.isArray(arr)
      ? arr.filter((x): x is string => isString(x) && validIds.has(x))
      : []

  return {
    brief: typeof parsed.brief === "string" ? parsed.brief : "",
    priorities: Array.isArray(parsed.priorities)
      ? parsed.priorities.filter(isString).slice(0, 5)
      : [],
    sections: {
      urgent: filterIds(parsed.sections?.urgent),
      important: filterIds(parsed.sections?.important),
      opportunity: filterIds(parsed.sections?.opportunity),
    },
    actions: validateActions(parsed.actions, validIds),
  }
}
