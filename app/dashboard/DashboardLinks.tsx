"use client"

import Link from "next/link"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import { useAiPanel } from "@/app/components/AiPanelContext"
import type { DashTask, DashNote } from "@/app/api/dashboard/route"

// ── Helpers ───────────────────────────────────────────────────────────────────

function isOverdue(iso: string) {
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d.getTime() < today.getTime()
}

function relativeDate(iso: string) {
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (d.getTime() === today.getTime()) return "today"
  if (d.getTime() === yesterday.getTime()) return "yesterday"
  return d.toLocaleDateString("en", { month: "short", day: "numeric" })
}

function shortPreview(content: string) {
  return content.replace(/\n/g, " ").trim().slice(0, 80)
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-3)" }}>
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  )
}

// ── Today's Tasks Widget ───────────────────────────────────────────────────────

function TodayTasksWidget({ tasks, onToggle }: { tasks: DashTask[]; onToggle: (id: string, status: string) => void }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "14px", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border-subtle)" }}>
        <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>
          Today&apos;s Focus
        </p>
        <Link href="/tasks" style={{ fontSize: "12px", color: "var(--accent)", textDecoration: "none", transition: "opacity 0.16s" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7" }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1" }}>
          View board →
        </Link>
      </div>

      {tasks.length === 0 ? (
        <div style={{ padding: "28px 20px", textAlign: "center" }}>
          <p style={{ fontSize: "13px", color: "var(--text-3)", margin: "0 0 4px" }}>No tasks due today</p>
          <Link href="/tasks?create=1" style={{ fontSize: "12px", color: "var(--accent)", textDecoration: "none" }}>
            + Add a task
          </Link>
        </div>
      ) : (
        <div>
          {tasks.map((task) => {
            const overdue = task.due_date && isOverdue(task.due_date)
            return (
              <div
                key={task.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "11px 20px",
                  borderBottom: "1px solid var(--border-subtle)",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)" }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
              >
                <button
                  onClick={() => onToggle(task.id, task.status)}
                  style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", flexShrink: 0 }}
                >
                  <CheckIcon />
                </button>
                <span style={{ flex: 1, fontSize: "14px", color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {task.title}
                </span>
                {task.due_date && (
                  <span style={{ fontSize: "11px", color: overdue ? "#DC2626" : "var(--text-3)", flexShrink: 0, fontWeight: overdue ? 500 : 400 }}>
                    {overdue ? "overdue" : "today"}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Recent Notes Widget ────────────────────────────────────────────────────────

function RecentNotesWidget({ notes }: { notes: DashNote[] }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "14px", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border-subtle)" }}>
        <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>
          Recent Notes
        </p>
        <Link href="/notes" style={{ fontSize: "12px", color: "var(--accent)", textDecoration: "none", transition: "opacity 0.16s" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7" }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1" }}>
          All notes →
        </Link>
      </div>

      {notes.length === 0 ? (
        <div style={{ padding: "28px 20px", textAlign: "center" }}>
          <p style={{ fontSize: "13px", color: "var(--text-3)", margin: "0 0 4px" }}>No notes yet</p>
          <Link href="/notes?compose=1" style={{ fontSize: "12px", color: "var(--accent)", textDecoration: "none" }}>
            + Write your first note
          </Link>
        </div>
      ) : (
        <div>
          {notes.map((note) => (
            <Link
              key={note.id}
              href={`/notes?open=${note.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "11px 20px",
                textDecoration: "none",
                borderBottom: "1px solid var(--border-subtle)",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)" }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
            >
              <p style={{ flex: 1, fontSize: "13px", color: "var(--text-1)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.4 }}>
                {shortPreview(note.content) || "Empty note"}
              </p>
              <span style={{ fontSize: "11px", color: "var(--text-3)", flexShrink: 0 }}>
                {relativeDate(note.created_at)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ── AI Panel quick-open card ───────────────────────────────────────────────────

function AiCard() {
  const { open } = useAiPanel()
  return (
    <div
      onClick={open}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "14px",
        padding: "20px",
        cursor: "pointer",
        transition: "border-color 0.16s, background 0.16s",
        display: "flex",
        alignItems: "center",
        gap: "14px",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--ai-border)"
        ;(e.currentTarget as HTMLElement).style.background = "var(--ai-accent-dim)"
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"
        ;(e.currentTarget as HTMLElement).style.background = "var(--bg-surface)"
      }}
    >
      <div style={{
        width: "36px",
        height: "36px",
        borderRadius: "10px",
        background: "var(--ai-accent-dim)",
        border: "1px solid var(--ai-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--ai-accent)",
        flexShrink: 0,
      }}>
        <SparkleIcon />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-1)", margin: "0 0 2px" }}>AI Assistant</p>
        <p style={{ fontSize: "12px", color: "var(--text-3)", margin: 0 }}>Ask anything, create tasks, search notes</p>
      </div>
      <span style={{ fontSize: "13px", color: "var(--text-3)" }}>→</span>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function DashboardLinks() {
  const { data, mutate } = useSWR<{ tasks: DashTask[]; notes: DashNote[] }>(
    "/api/dashboard",
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      keepPreviousData: true,
    }
  )

  const tasks = data?.tasks ?? []
  const notes = data?.notes ?? []

  async function toggleTask(id: string, currentStatus: string) {
    const newStatus = currentStatus === "done" ? "inbox" : "done"
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    mutate()
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <TodayTasksWidget tasks={tasks} onToggle={toggleTask} />
      <RecentNotesWidget notes={notes} />
      <AiCard />
    </div>
  )
}
