import type { AiResponse, NoteSource, ToolEvent } from "@/lib/types"
import { COMMANDS } from "@/lib/query-handler"

function escapeMd(s: string): string {
  return s.replace(/([\\`*_{}\[\]()#+\-.!])/g, "\\$1")
}

function renderWithSources(text: string, sources?: NoteSource[]): string {
  const base = process.env.NEXT_PUBLIC_APP_URL
  if (!base || !sources || sources.length === 0) return text
  const lines = sources.map(
    (s) => `• [${escapeMd(s.preview)}](${base}/notes/${s.id})`
  )
  return `${text}\n\n---\n📎 Sources:\n${lines.join("\n")}`
}

export function formatTodoList(r: Extract<AiResponse, { kind: "todo_list" }>): string {
  if (r.tasks.length === 0) {
    return "📋 No active tasks. Create one with /task <title>"
  }
  const sections = [
    { status: "doing",   label: "🔵 Doing" },
    { status: "next",    label: "⏭ Next" },
    { status: "waiting", label: "⏳ Waiting" },
    { status: "inbox",   label: "📥 Inbox" },
  ]
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  let msg = "📋 Tasks\n"
  for (const { status, label } of sections) {
    const group = r.tasks.filter((t) => t.status === status)
    if (group.length === 0) continue
    msg += `\n${label}\n`
    for (const t of group) {
      msg += `• ${t.title}`
      if (t.due_date) {
        const d = new Date(t.due_date); d.setHours(0, 0, 0, 0)
        if (d.getTime() === today.getTime())          msg += " (today)"
        else if (d.getTime() === tomorrow.getTime())  msg += " (tomorrow)"
        else if (d < today)                           msg += " (⚠ overdue)"
        else msg += ` (${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })})`
      }
      msg += "\n"
    }
  }
  return msg.trim()
}

export function formatForTelegram(r: AiResponse): string {
  switch (r.kind) {
    case "answer":
      return renderWithSources(r.text, r.sources)

    case "temporal_answer":
      return renderWithSources(r.text, r.sources)

    case "note_created": {
      let msg = `✅ Saved! ${r.entities.length} entit${r.entities.length === 1 ? "y" : "ies"} linked`
      if (r.entities.length > 0) {
        msg += "\n\n🏷️ Entities:\n"
        msg += r.entities.map((e) => `• ${e.name} (${e.type})`).join("\n")
      }
      return msg
    }

    case "task_created": {
      const task = r.task as {
        title: string
        due_date?: string | null
        priority?: string | null
        entities?: Array<{ name: string }>
      }
      let msg = `✅ Task: "${task.title}"`
      if (task.due_date) {
        const d = new Date(task.due_date)
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
        d.setHours(0, 0, 0, 0)
        if (d.getTime() === today.getTime())          msg += "\n📅 Due: Today"
        else if (d.getTime() === tomorrow.getTime()) msg += "\n📅 Due: Tomorrow"
        else msg += `\n📅 Due: ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      }
      if (task.priority && task.priority !== "medium") {
        msg += `\n⚡ Priority: ${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}`
      }
      if (Array.isArray(task.entities) && task.entities.length > 0) {
        msg += `\n🏷️ Linked: ${task.entities.map((e) => e.name).join(", ")}`
      }
      return msg
    }

    case "todo_list":
      return formatTodoList(r)

    case "entity_summary": {
      let msg = `🧠 ${r.entityName}\n\n📄 Summary:\n${r.summary}`
      if (r.relatedNotes.length > 0) {
        msg += `\n\n📝 Recent notes:\n`
        msg += r.relatedNotes.slice(0, 3).map((n) => `• ${n.content.slice(0, 100)}`).join("\n")
      }
      return msg
    }

    case "tool_answer": {
      const text = r.text || "Done."
      const noteSources: NoteSource[] = []
      const seen = new Set<string>()
      for (const ev of (r.events ?? []) as ToolEvent[]) {
        if (ev.kind !== "tool_result" || ev.name !== "search_notes" || !ev.result) continue
        const sources = (ev.result as { sources?: NoteSource[] }).sources
        if (!Array.isArray(sources)) continue
        for (const s of sources) {
          if (s && s.id && !seen.has(s.id)) {
            seen.add(s.id)
            noteSources.push(s)
          }
        }
      }
      return renderWithSources(text, noteSources)
    }

    case "commands":
      return COMMANDS.map((c) => `${c.name} — ${c.description}`).join("\n")

    case "error":
      return `❌ ${r.text}`

    default:
      return "Something went wrong."
  }
}
