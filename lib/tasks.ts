import type { SupabaseClient } from "@supabase/supabase-js"

export type TaskStatus = "inbox" | "next" | "doing" | "waiting" | "done"
export type TaskPriority = "low" | "medium" | "high"
export type TaskCreatedFrom = "manual" | "note" | "telegram"

export interface Task {
  id: string
  user_id: string
  title: string
  description: string | null
  status: TaskStatus
  due_date: string | null
  priority: TaskPriority
  linked_note_id: string | null
  created_from: TaskCreatedFrom
  telegram_message_id: string | null
  created_at: string
  updated_at: string
}

export interface TaskEntity {
  id: string
  name: string
  type: string
}

export interface TaskWithEntities extends Task {
  entities: TaskEntity[]
}

export interface CreateTaskInput {
  title: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  due_date?: string | null
  linked_note_id?: string | null
  created_from?: TaskCreatedFrom
  telegram_message_id?: string | null
}

// ── Core task creation ─────────────────────────────────────────────────────────

export async function createTask(
  db: SupabaseClient,
  userId: string,
  input: CreateTaskInput
): Promise<TaskWithEntities> {
  const { data: task, error } = await db
    .from("tasks")
    .insert({
      user_id: userId,
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      status: input.status ?? "inbox",
      priority: input.priority ?? "medium",
      due_date: input.due_date ?? null,
      linked_note_id: input.linked_note_id ?? null,
      created_from: input.created_from ?? "manual",
      telegram_message_id: input.telegram_message_id ?? null,
    })
    .select()
    .single()

  if (error || !task) throw error ?? new Error("Task insert failed")

  const entities = await linkTaskEntities(db, userId, task.id, input.title)

  return { ...task, entities }
}

// ── Entity linking ─────────────────────────────────────────────────────────────

async function linkTaskEntities(
  db: SupabaseClient,
  userId: string,
  taskId: string,
  title: string
): Promise<TaskEntity[]> {
  try {
    const { extractEntities } = await import("@/lib/extractEntities")
    const rawEntities = await extractEntities(title)
    if (!Array.isArray(rawEntities) || rawEntities.length === 0) return []

    const linked: TaskEntity[] = []

    for (const entity of rawEntities) {
      const name = entity.name?.trim()
      const type = entity.type?.trim()
      if (!name || !type) continue

      try {
        const { data: existing } = await db
          .from("entities")
          .select("id, name, type")
          .eq("user_id", userId)
          .ilike("name", name)
          .maybeSingle()

        let entityId: string
        if (existing) {
          entityId = existing.id
        } else {
          const { data: newEntity } = await db
            .from("entities")
            .insert({
              user_id: userId,
              name,
              type,
              attributes: entity.attributes ?? {},
              events: entity.events ?? [],
              relationships: entity.relationships ?? [],
              responsibilities: entity.responsibilities ?? [],
              summary: null,
              summary_updated_at: null,
            })
            .select("id")
            .single()
          if (!newEntity) continue
          entityId = newEntity.id
        }

        await db
          .from("task_entities")
          .upsert({ task_id: taskId, entity_id: entityId })

        linked.push({
          id: entityId,
          name: existing?.name ?? name,
          type: existing?.type ?? type,
        })
      } catch (err) {
        console.error(`Task entity link error (${name}):`, err)
      }
    }

    return linked
  } catch (err) {
    console.error("Task entity linking failed:", err)
    return []
  }
}

// ── NLP parser for Telegram /task command ─────────────────────────────────────

function nextWeekday(from: Date, targetDay: number): Date {
  const d = new Date(from)
  const current = d.getDay()
  let delta = targetDay - current
  if (delta <= 0) delta += 7
  d.setDate(d.getDate() + delta)
  return d
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

const WEEKDAY_MAP: Record<string, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
  friday: 5, saturday: 6, sunday: 0,
}

export function parseTaskText(raw: string): {
  title: string
  priority: TaskPriority
  due_date: string | null
} {
  let text = raw.trim()
  let priority: TaskPriority = "medium"
  let due_date: string | null = null

  // Priority extraction (check urgent/high before low)
  if (/\b(urgent|high)\b/i.test(text)) {
    priority = "high"
    text = text.replace(/\b(urgent|high)\b/gi, "").trim()
  } else if (/\blow\b/i.test(text)) {
    priority = "low"
    text = text.replace(/\blow\b/gi, "").trim()
  }

  // Date extraction (most specific patterns first)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const dateRules: Array<[RegExp, (m: RegExpMatchArray) => Date]> = [
    [
      /\bin\s+(\d+)\s+days?\b/i,
      (m) => {
        const d = new Date(today)
        d.setDate(d.getDate() + parseInt(m[1], 10))
        return d
      },
    ],
    [
      /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
      (m) => nextWeekday(today, WEEKDAY_MAP[m[1].toLowerCase()]),
    ],
    [
      /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i,
      (m) => {
        const d = new Date(today)
        d.setMonth(MONTH_MAP[m[2].toLowerCase()], parseInt(m[1], 10))
        if (d < today) d.setFullYear(d.getFullYear() + 1)
        return d
      },
    ],
    [
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})\b/i,
      (m) => {
        const d = new Date(today)
        d.setMonth(MONTH_MAP[m[1].toLowerCase()], parseInt(m[2], 10))
        if (d < today) d.setFullYear(d.getFullYear() + 1)
        return d
      },
    ],
    [
      /\btonight\b/i,
      () => {
        const d = new Date(today)
        d.setHours(20, 0, 0, 0)
        return d
      },
    ],
    [
      /\btomorrow\b/i,
      () => {
        const d = new Date(today)
        d.setDate(d.getDate() + 1)
        return d
      },
    ],
    [/\btoday\b/i, () => new Date(today)],
  ]

  for (const [rx, fn] of dateRules) {
    const match = text.match(rx)
    if (match) {
      due_date = fn(match).toISOString()
      text = text.replace(match[0], "").trim()
      break
    }
  }

  const title = text.replace(/\s+/g, " ").trim() || raw.trim()

  return { title, priority, due_date }
}
