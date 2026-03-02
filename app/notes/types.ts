export interface Entity {
  id: string
  name: string
  type: string
}

export interface Space {
  id: string
  name: string
  note_count: number
}

export interface Tag {
  id: string
  name: string
}

export interface Note {
  id: string
  user_id: string
  content: string
  created_at: string
}

export interface NoteWithEntities {
  id: string
  content: string
  created_at: string
  entities: Entity[]
  spaces: Space[]
  tags: Tag[]
}

export interface NoteDetail {
  id: string
  content: string
  created_at: string
  relatedEntities: Entity[]
}

// ── Task types (shared across client components) ───────────────────────────────

export type TaskStatus = "inbox" | "next" | "doing" | "waiting" | "done"
export type TaskPriority = "low" | "medium" | "high"
export type TaskCreatedFrom = "manual" | "note" | "telegram"

export interface TaskEntity {
  id: string
  name: string
  type: string
}

export interface TaskWithEntities {
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
  entities: TaskEntity[]
}
