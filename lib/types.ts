export interface NoteSource {
  id: string
  preview: string
}

export type AiResponse =
  | { kind: "answer";          text: string; sources?: NoteSource[] }
  | { kind: "temporal_answer"; text: string; rangeLabel: string; noteCount: number; sources?: NoteSource[] }
  | { kind: "note_created";    note: { id: string; content: string; created_at: string }; entities: Array<{ name: string; type: string }> }
  | { kind: "task_created";    task: Record<string, unknown> }
  | { kind: "todo_list";       tasks: Array<{ title: string; status: string; due_date: string | null; priority: string }> }
  | { kind: "entity_summary";  entityName: string; summary: string; relatedNotes: Array<{ id: string; content: string }> }
  | { kind: "commands";        commands: Array<{ name: string; description: string }> }
  | { kind: "tool_answer";     text: string; events: ToolEvent[] }
  | { kind: "error";           text: string }

export type ToolEvent =
  | { kind: "tool_call";   name: string; args?: unknown }
  | { kind: "tool_result"; name: string; result?: unknown; error?: string; code?: string }
