"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import type { TaskPriority, TaskStatus, TaskWithEntities } from "@/lib/tasks"

interface Props {
  task: TaskWithEntities
  onClose: () => void
  onUpdated: (task: TaskWithEntities) => void
  onDeleted: (taskId: string) => void
}

const PRIORITIES: Array<{ value: TaskPriority; label: string; color: string }> = [
  { value: "low", label: "Low", color: "#9CA3AF" },
  { value: "medium", label: "Medium", color: "#D97706" },
  { value: "high", label: "High", color: "#DC2626" },
]

const STATUSES: Array<{ value: TaskStatus; label: string }> = [
  { value: "inbox", label: "Inbox" },
  { value: "next", label: "Next" },
  { value: "doing", label: "Doing" },
  { value: "waiting", label: "Waiting" },
  { value: "done", label: "Done" },
]

const STATUS_META: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  inbox:   { label: "Inbox",   color: "#6B7280", bg: "rgba(107,114,128,0.1)" },
  next:    { label: "Next",    color: "#2563EB", bg: "rgba(37,99,235,0.1)"   },
  doing:   { label: "Doing",   color: "#D97706", bg: "rgba(217,119,6,0.1)"   },
  waiting: { label: "Waiting", color: "#7C3AED", bg: "rgba(124,58,237,0.1)"  },
  done:    { label: "Done",    color: "#059669", bg: "rgba(5,150,105,0.1)"   },
}

const PRIORITY_META: Record<TaskPriority, { label: string; color: string }> = {
  low:    { label: "Low",    color: "#9CA3AF" },
  medium: { label: "Medium", color: "#D97706" },
  high:   { label: "High",   color: "#DC2626" },
}

function fmtDate(iso: string): { text: string; overdue: boolean } {
  const d = new Date(iso); d.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  if (d.getTime() === today.getTime()) return { text: "Today", overdue: false }
  if (d.getTime() === tomorrow.getTime()) return { text: "Tomorrow", overdue: false }
  if (d < today) return { text: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), overdue: true }
  return { text: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), overdue: false }
}

export default function TaskDetailModal({ task, onClose, onUpdated, onDeleted }: Props) {
  const [mode, setMode] = useState<"view" | "edit">("view")

  // Edit form state
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? "")
  const [dueDate, setDueDate] = useState(task.due_date ? task.due_date.slice(0, 10) : "")
  const [priority, setPriority] = useState<TaskPriority>(task.priority)
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode === "edit") titleRef.current?.focus()
  }, [mode])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (mode === "edit") cancelEdit()
        else onClose()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [mode, onClose]) // eslint-disable-line react-hooks/exhaustive-deps

  function cancelEdit() {
    setTitle(task.title)
    setDescription(task.description ?? "")
    setDueDate(task.due_date ? task.due_date.slice(0, 10) : "")
    setPriority(task.priority)
    setStatus(task.status)
    setError(null)
    setMode("view")
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          status,
          priority,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
        }),
      })
      if (!res.ok) throw new Error("Failed to update task")
      onUpdated({
        ...task,
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  const statusM = STATUS_META[task.status]
  const priorityM = PRIORITY_META[task.priority]
  const dateInfo = task.due_date ? fmtDate(task.due_date) : null

  // ── View mode ────────────────────────────────────────────────────────────────
  if (mode === "view") {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "480px",
          padding: "28px",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-3)", fontWeight: 500 }}>Task</p>
            <button
              onClick={onClose}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)", padding: "4px", borderRadius: "6px", fontSize: "18px", lineHeight: 1, transition: "color 0.18s" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-1)" }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)" }}
            >×</button>
          </div>

          {/* Title */}
          <p style={{
            margin: 0,
            fontSize: "18px",
            fontWeight: 600,
            color: task.status === "done" ? "var(--text-3)" : "var(--text-1)",
            lineHeight: 1.4,
            textDecoration: task.status === "done" ? "line-through" : "none",
          }}>
            {task.title}
          </p>

          {/* Description */}
          {task.description && (
            <p style={{ margin: 0, fontSize: "14px", color: "var(--text-2)", lineHeight: 1.6 }}>
              {task.description}
            </p>
          )}

          {/* Meta chips */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{
              fontSize: "12px",
              padding: "3px 10px",
              borderRadius: "999px",
              background: statusM.bg,
              color: statusM.color,
              fontWeight: 500,
            }}>
              {statusM.label}
            </span>
            <span style={{
              fontSize: "12px",
              padding: "3px 10px",
              borderRadius: "999px",
              background: `${priorityM.color}15`,
              color: priorityM.color,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: priorityM.color, display: "inline-block" }} />
              {priorityM.label}
            </span>
            {dateInfo && (
              <span style={{
                fontSize: "12px",
                color: dateInfo.overdue ? "#DC2626" : "var(--text-3)",
                fontWeight: dateInfo.overdue ? 500 : 400,
              }}>
                {dateInfo.overdue ? "⚠ " : "📅 "}{dateInfo.text}
              </span>
            )}
          </div>

          {/* Entities */}
          {task.entities.length > 0 && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {task.entities.map((e) => (
                <span key={e.id} style={{
                  fontSize: "11px",
                  padding: "2px 7px",
                  borderRadius: "999px",
                  background: "rgba(91,110,174,0.08)",
                  color: "var(--accent)",
                  border: "1px solid rgba(91,110,174,0.16)",
                }}>
                  {e.name}
                </span>
              ))}
            </div>
          )}

          {/* Note link */}
          {task.linked_note_id && (
            <Link href={`/notes?open=${task.linked_note_id}`} onClick={onClose}
              style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--accent)", textDecoration: "none", transition: "opacity 0.15s" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7" }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1" }}>
              📄 View linked note →
            </Link>
          )}

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "4px" }}>
            <button
              onClick={() => onDeleted(task.id)}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                border: "1px solid rgba(220,38,38,0.2)",
                background: "transparent",
                color: "#DC2626",
                cursor: "pointer",
                transition: "background 0.18s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(220,38,38,0.06)" }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
            >
              Delete
            </button>
            <button
              onClick={() => setMode("edit")}
              style={{
                padding: "9px 20px",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 500,
                border: "none",
                background: "var(--accent)",
                color: "#fff",
                cursor: "pointer",
                transition: "opacity 0.18s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88" }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1" }}
            >
              Edit
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Edit mode ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        width: "100%",
        maxWidth: "480px",
        padding: "28px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "var(--text-1)" }}>Edit Task</p>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)", padding: "4px", borderRadius: "6px", fontSize: "18px", lineHeight: 1, transition: "color 0.18s" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-1)" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)" }}
          >×</button>
        </div>

        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: "8px", background: "var(--bg-surface)", color: "var(--text-1)", fontSize: "15px", outline: "none", transition: "border-color 0.18s", boxSizing: "border-box" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)" }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)" }}
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Details (optional)"
            rows={2}
            style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: "8px", background: "var(--bg-surface)", color: "var(--text-1)", fontSize: "14px", resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.6, transition: "border-color 0.18s", boxSizing: "border-box" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)" }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)" }}
          />

          <div style={{ display: "flex", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: "12px", color: "var(--text-3)", marginBottom: "6px", fontWeight: 500 }}>Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "8px", background: "var(--bg-surface)", color: "var(--text-1)", fontSize: "14px", outline: "none", transition: "border-color 0.18s", boxSizing: "border-box" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)" }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "var(--text-3)", marginBottom: "6px", fontWeight: 500 }}>Priority</label>
              <div style={{ display: "flex", gap: "6px" }}>
                {PRIORITIES.map((p) => (
                  <button key={p.value} type="button" onClick={() => setPriority(p.value)} style={{ padding: "7px 12px", borderRadius: "7px", fontSize: "13px", fontWeight: priority === p.value ? 600 : 400, border: `1px solid ${priority === p.value ? p.color : "var(--border)"}`, background: priority === p.value ? `${p.color}15` : "transparent", color: priority === p.value ? p.color : "var(--text-2)", cursor: "pointer", transition: "all 0.18s" }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", color: "var(--text-3)", marginBottom: "6px", fontWeight: 500 }}>Column</label>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {STATUSES.map((s) => (
                <button key={s.value} type="button" onClick={() => setStatus(s.value)} style={{ padding: "6px 12px", borderRadius: "7px", fontSize: "13px", fontWeight: status === s.value ? 600 : 400, border: `1px solid ${status === s.value ? "var(--accent)" : "var(--border)"}`, background: status === s.value ? "var(--accent-dim)" : "transparent", color: status === s.value ? "var(--accent)" : "var(--text-2)", cursor: "pointer", transition: "all 0.18s" }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {task.entities.length > 0 && (
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "var(--text-3)", marginBottom: "6px", fontWeight: 500 }}>Entities</label>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {task.entities.map((e) => (
                  <span key={e.id} style={{ fontSize: "11px", padding: "2px 7px", borderRadius: "999px", background: "rgba(91,110,174,0.08)", color: "var(--accent)", border: "1px solid rgba(91,110,174,0.16)" }}>
                    {e.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {error && <p style={{ margin: 0, fontSize: "13px", color: "#DC2626" }}>{error}</p>}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "4px" }}>
            <button
              type="button"
              onClick={() => onDeleted(task.id)}
              style={{ padding: "8px 14px", borderRadius: "8px", fontSize: "13px", border: "1px solid rgba(220,38,38,0.2)", background: "transparent", color: "#DC2626", cursor: "pointer", transition: "background 0.18s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(220,38,38,0.06)" }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
            >
              Delete
            </button>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={cancelEdit}
                style={{ padding: "9px 18px", borderRadius: "8px", fontSize: "14px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-2)", cursor: "pointer", transition: "color 0.18s" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-1)" }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-2)" }}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={saving || !title.trim()}
                style={{ padding: "9px 20px", borderRadius: "8px", fontSize: "14px", fontWeight: 500, border: "none", background: saving || !title.trim() ? "var(--border)" : "var(--accent)", color: saving || !title.trim() ? "var(--text-3)" : "#fff", cursor: saving || !title.trim() ? "not-allowed" : "pointer", transition: "background 0.18s" }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
