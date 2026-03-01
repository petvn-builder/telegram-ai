"use client"

import { useEffect, useRef, useState } from "react"
import type { TaskPriority, TaskStatus, TaskWithEntities } from "@/lib/tasks"

interface Props {
  onClose: () => void
  onCreated: (task: TaskWithEntities) => void
  linkedNoteId?: string
  initialTitle?: string
  initialStatus?: TaskStatus
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

export default function CreateTaskModal({
  onClose,
  onCreated,
  linkedNoteId,
  initialTitle = "",
  initialStatus = "inbox",
}: Props) {
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [priority, setPriority] = useState<TaskPriority>("medium")
  const [status, setStatus] = useState<TaskStatus>(initialStatus)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
    titleRef.current?.select()
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError(null)

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          status: linkedNoteId ? "inbox" : status,
          priority,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          linked_note_id: linkedNoteId ?? null,
          created_from: linkedNoteId ? "note" : "manual",
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Failed to create task")
      }

      const task: TaskWithEntities = await res.json()
      onCreated(task)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  return (
    // Overlay
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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Modal */}
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "480px",
          padding: "28px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "var(--text-1)" }}>
            New Task
          </p>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-3)",
              padding: "4px",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              fontSize: "18px",
              lineHeight: 1,
              transition: "color 0.18s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-1)" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)" }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Title */}
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            required
            style={{
              width: "100%",
              padding: "10px 14px",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              background: "var(--bg-surface)",
              color: "var(--text-1)",
              fontSize: "15px",
              outline: "none",
              transition: "border-color 0.18s",
              boxSizing: "border-box",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)" }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)" }}
          />

          {/* Description */}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Details (optional)"
            rows={2}
            style={{
              width: "100%",
              padding: "10px 14px",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              background: "var(--bg-surface)",
              color: "var(--text-1)",
              fontSize: "14px",
              resize: "vertical",
              outline: "none",
              fontFamily: "inherit",
              lineHeight: 1.6,
              transition: "border-color 0.18s",
              boxSizing: "border-box",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)" }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)" }}
          />

          {/* Due date + Priority row */}
          <div style={{ display: "flex", gap: "12px" }}>
            {/* Due date */}
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: "12px", color: "var(--text-3)", marginBottom: "6px", fontWeight: 500 }}>
                Due date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  background: "var(--bg-surface)",
                  color: "var(--text-1)",
                  fontSize: "14px",
                  outline: "none",
                  transition: "border-color 0.18s",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)" }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)" }}
              />
            </div>

            {/* Priority */}
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "var(--text-3)", marginBottom: "6px", fontWeight: 500 }}>
                Priority
              </label>
              <div style={{ display: "flex", gap: "6px" }}>
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    style={{
                      padding: "7px 12px",
                      borderRadius: "7px",
                      fontSize: "13px",
                      fontWeight: priority === p.value ? 600 : 400,
                      border: `1px solid ${priority === p.value ? p.color : "var(--border)"}`,
                      background: priority === p.value ? `${p.color}15` : "transparent",
                      color: priority === p.value ? p.color : "var(--text-2)",
                      cursor: "pointer",
                      transition: "all 0.18s",
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Status (only when not creating from a note) */}
          {!linkedNoteId && (
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "var(--text-3)", marginBottom: "6px", fontWeight: 500 }}>
                Column
              </label>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {STATUSES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStatus(s.value)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "7px",
                      fontSize: "13px",
                      fontWeight: status === s.value ? 600 : 400,
                      border: `1px solid ${status === s.value ? "var(--accent)" : "var(--border)"}`,
                      background: status === s.value ? "var(--accent-dim)" : "transparent",
                      color: status === s.value ? "var(--accent)" : "var(--text-2)",
                      cursor: "pointer",
                      transition: "all 0.18s",
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p style={{ margin: 0, fontSize: "13px", color: "#DC2626" }}>{error}</p>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", paddingTop: "4px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "9px 18px",
                borderRadius: "8px",
                fontSize: "14px",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-2)",
                cursor: "pointer",
                transition: "color 0.18s, border-color 0.18s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-1)"; e.currentTarget.style.borderColor = "var(--text-3)" }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-2)"; e.currentTarget.style.borderColor = "var(--border)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              style={{
                padding: "9px 20px",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 500,
                border: "none",
                background: saving || !title.trim() ? "var(--border)" : "var(--accent)",
                color: saving || !title.trim() ? "var(--text-3)" : "#fff",
                cursor: saving || !title.trim() ? "not-allowed" : "pointer",
                transition: "background 0.18s, color 0.18s",
              }}
            >
              {saving ? "Creating…" : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
