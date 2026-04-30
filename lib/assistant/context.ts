import type {
  NormalizedEmailSummary,
  NormalizedEvent,
} from "@/mcp/shared/types"
import type { DashTask, DashNote } from "@/app/api/dashboard/route"

export type ContextItemType = "email" | "task" | "note" | "event"

export type ContextItem = {
  id: string
  type: ContextItemType
  title: string
  content: string
  createdAt: string
  metadata?: {
    urgency?: number
    source?: string
    people?: string[]
    requiresAction?: boolean
    dueDate?: string | null
    link?: string
    unread?: boolean
    status?: string
    threadId?: string
    from?: string
  }
}

export function scoreItem(item: ContextItem): number {
  let s = 0
  const todayStr = new Date().toISOString().split("T")[0]
  if (item.metadata?.dueDate) s += 2
  if (item.metadata?.dueDate && item.metadata.dueDate < todayStr) s += 3
  if (item.type === "email" && item.metadata?.requiresAction) s += 3
  if (item.type === "email" && item.metadata?.unread) s += 1
  const ageHours = (Date.now() - new Date(item.createdAt).getTime()) / 36e5
  if (ageHours < 24) s += 1
  s += (item.metadata?.urgency ?? 0) * 2
  return s
}

const ACTION_PHRASES = [
  "?",
  "can you",
  "could you",
  "please",
  "let me know",
  "thoughts",
  "need your",
  "waiting on",
  "follow up",
  "follow-up",
]

function looksLikeAutomation(from: string): boolean {
  return /no[-_.]?reply|notifications?@|do[-_.]?not[-_.]?reply|mailer|newsletter/i.test(
    from
  )
}

function emailRequiresAction(e: NormalizedEmailSummary): boolean {
  if (looksLikeAutomation(e.from)) return false
  const haystack = `${e.subject} ${e.snippet}`.toLowerCase()
  return ACTION_PHRASES.some((p) => haystack.includes(p))
}

export function emailToItem(e: NormalizedEmailSummary): ContextItem {
  const requiresAction = emailRequiresAction(e)
  const recentMs = Date.now() - new Date(e.date).getTime()
  const recent = recentMs < 1000 * 60 * 60 * 24
  let urgency = 0.5
  if (requiresAction && e.unread && recent) urgency = 0.85
  else if (requiresAction && e.unread) urgency = 0.7
  else if (looksLikeAutomation(e.from)) urgency = 0.15

  return {
    id: `email:${e.id}`,
    type: "email",
    title: e.subject || "(no subject)",
    content: e.snippet || "",
    createdAt: e.date,
    metadata: {
      urgency,
      source: "gmail",
      people: [e.from, ...e.to].filter(Boolean),
      requiresAction,
      unread: e.unread,
      threadId: e.threadId,
      from: e.from,
    },
  }
}

export function eventToItem(e: NormalizedEvent): ContextItem {
  const startMs = new Date(e.start).getTime()
  const endMs = new Date(e.end).getTime()
  const now = Date.now()
  let urgency = 0.4
  if (now >= startMs && now <= endMs) urgency = 1
  else if (startMs > now) {
    const minutes = (startMs - now) / 60000
    if (minutes < 15) urgency = 0.95
    else if (minutes < 60) urgency = 0.8
    else if (minutes < 240) urgency = 0.6
    else urgency = 0.4
  } else {
    urgency = 0.1
  }

  return {
    id: `event:${e.id}`,
    type: "event",
    title: e.summary || "(untitled event)",
    content: e.description || (e.location ? `at ${e.location}` : ""),
    createdAt: e.start,
    metadata: {
      urgency,
      source: "calendar",
      people: e.attendees.map((a) => a.email).filter(Boolean),
      link: e.htmlLink,
      status: e.status,
    },
  }
}

export function taskToItem(t: DashTask): ContextItem {
  const todayStr = new Date().toISOString().split("T")[0]
  let urgency = 0.3
  if (t.due_date) {
    if (t.due_date < todayStr) urgency = 1
    else if (t.due_date === todayStr) urgency = 0.85
    else urgency = 0.4
  } else if (t.status === "doing") urgency = 0.55
  else if (t.status === "next") urgency = 0.4
  else urgency = 0.2

  return {
    id: `task:${t.id}`,
    type: "task",
    title: t.title,
    content: "",
    createdAt: t.due_date ?? new Date().toISOString(),
    metadata: {
      urgency,
      source: "tasks",
      dueDate: t.due_date,
      status: t.status,
    },
  }
}

export function noteToItem(n: DashNote): ContextItem {
  const preview = n.content.length > 200 ? n.content.slice(0, 200) + "…" : n.content
  return {
    id: `note:${n.id}`,
    type: "note",
    title: preview.split("\n")[0].slice(0, 80) || "(note)",
    content: preview,
    createdAt: n.created_at,
    metadata: {
      urgency: 0.2,
      source: "notes",
    },
  }
}
