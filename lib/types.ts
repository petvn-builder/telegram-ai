export type AiResponse =
  | { kind: "answer";          text: string }
  | { kind: "temporal_answer"; text: string; rangeLabel: string; noteCount: number }
  | { kind: "note_created";    note: { id: string; content: string; created_at: string }; entities: Array<{ name: string; type: string }> }
  | { kind: "task_created";    task: Record<string, unknown> }
  | { kind: "todo_list";       tasks: Array<{ title: string; status: string; due_date: string | null; priority: string }> }
  | { kind: "entity_summary";  entityName: string; summary: string; relatedNotes: Array<{ id: string; content: string }> }
  | { kind: "commands";        commands: Array<{ name: string; description: string }> }
  | { kind: "error";           text: string }
