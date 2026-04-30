import OpenAI from "openai"
import type { ContextItem } from "./context"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export type BriefSection = "urgent" | "important" | "opportunity"
export type BriefActionType = "reply" | "task" | "schedule"

export type BriefAction = {
  itemId: string
  suggestion: string
  type: BriefActionType
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
}

const SYSTEM = `You are an executive assistant producing a daily command-center brief.
Prioritize human requests over algorithmic noise. Detect:
- Emails awaiting a reply (especially unread + requiresAction)
- Overdue or due-today tasks
- Meetings happening soon or right now
- Free time gaps in the calendar worth using

Rules:
- "urgent" = needs action today (overdue tasks, meetings starting soon, time-sensitive emails)
- "important" = should be addressed this week (follow-ups, planning, undated active tasks)
- "opportunity" = optional / nice-to-have (recent notes to revisit, free time blocks)
- Every id in sections.* and actions.itemId MUST exist verbatim in the input items
- Suggestions must be concrete and short (one sentence, imperative voice)
- Action type:
  - "reply" only for emails
  - "task" when the item should become a tracked todo
  - "schedule" when it needs a calendar slot
- Return AT MOST 6 actions, ordered by importance
- The brief field is 2–4 sentences, conversational, mentions today's date naturally

Output STRICT JSON matching:
{
  "brief": string,
  "priorities": string[],          // 3–5 short bullets
  "sections": { "urgent": string[], "important": string[], "opportunity": string[] },
  "actions": [{ "itemId": string, "suggestion": string, "type": "reply"|"task"|"schedule" }]
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
    Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string" && validIds.has(x)) : []

  return {
    brief: typeof parsed.brief === "string" ? parsed.brief : "",
    priorities: Array.isArray(parsed.priorities)
      ? parsed.priorities.filter((p): p is string => typeof p === "string").slice(0, 5)
      : [],
    sections: {
      urgent: filterIds(parsed.sections?.urgent),
      important: filterIds(parsed.sections?.important),
      opportunity: filterIds(parsed.sections?.opportunity),
    },
    actions: Array.isArray(parsed.actions)
      ? parsed.actions
          .filter(
            (a): a is BriefAction =>
              !!a &&
              typeof (a as BriefAction).itemId === "string" &&
              validIds.has((a as BriefAction).itemId) &&
              typeof (a as BriefAction).suggestion === "string" &&
              ["reply", "task", "schedule"].includes((a as BriefAction).type)
          )
          .slice(0, 6)
      : [],
  }
}
