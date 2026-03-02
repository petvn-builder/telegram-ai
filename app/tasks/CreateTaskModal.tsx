"use client"

import { useEffect, useRef, useState } from "react"
import type { TaskPriority, TaskStatus, TaskWithEntities } from "@/lib/tasks"

interface TaskRow {
  id: string
  title: string
  dueDate: string
  priority: TaskPriority
}

interface Props {
  onClose: () => void
  onCreated: (tasks: TaskWithEntities[]) => void
  onBackgroundResolved?: (pairs: { tempId: string; real: TaskWithEntities | null }[]) => void
  linkedNoteId?: string
  initialTitle?: string
  initialStatus?: TaskStatus
}

const PRIORITIES: Array<{ value: TaskPriority; color: string; label: string }> = [
  { value: "low",    color: "#9CA3AF", label: "L" },
  { value: "medium", color: "#D97706", label: "M" },
  { value: "high",   color: "#DC2626", label: "H" },
]

const STATUSES: Array<{ value: TaskStatus; label: string }> = [
  { value: "inbox",   label: "Inbox"   },
  { value: "next",    label: "Next"    },
  { value: "doing",   label: "Doing"   },
  { value: "waiting", label: "Waiting" },
  { value: "done",    label: "Done"    },
]

function newRow(title = ""): TaskRow {
  return { id: `row-${Date.now()}-${Math.random()}`, title, dueDate: "", priority: "medium" }
}

export default function CreateTaskModal({
  onClose,
  onCreated,
  onBackgroundResolved,
  linkedNoteId,
  initialTitle = "",
  initialStatus = "inbox",
}: Props) {
  const [rows, setRows] = useState<TaskRow[]>(() => [newRow(initialTitle)])
  const [status, setStatus] = useState<TaskStatus>(initialStatus)

  const firstInputRef = useRef<HTMLInputElement>(null)
  const rowRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  useEffect(() => {
    firstInputRef.current?.focus()
    firstInputRef.current?.select()
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  function updateRow(id: string, patch: Partial<TaskRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function addRow() {
    const r = newRow()
    setRows((prev) => [...prev, r])
    // Focus the new row after render
    setTimeout(() => rowRefs.current.get(r.id)?.focus(), 30)
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev))
  }

  function handleRowKeyDown(e: React.KeyboardEvent, rowId: string, idx: number) {
    if (e.key === "Enter") {
      e.preventDefault()
      if (idx === rows.length - 1) {
        addRow()
      } else {
        // Move to next row
        const nextRow = rows[idx + 1]
        rowRefs.current.get(nextRow.id)?.focus()
      }
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const valid = rows.filter((r) => r.title.trim())
    if (!valid.length) return

    // Build optimistic tasks
    const now = new Date().toISOString()
    const optimistic: TaskWithEntities[] = valid.map((row) => ({
      id: `temp-${Date.now()}-${row.id}`,
      user_id: "",
      title: row.title.trim(),
      description: null,
      due_date: row.dueDate ? new Date(row.dueDate).toISOString() : null,
      status: (linkedNoteId ? "inbox" : status) as TaskStatus,
      priority: row.priority,
      linked_note_id: linkedNoteId ?? null,
      created_from: linkedNoteId ? "note" as const : "manual" as const,
      telegram_message_id: null,
      created_at: now,
      updated_at: now,
      entities: [],
    }))

    // Close immediately — optimistic UI
    onCreated(optimistic)

    // Background POSTs
    const saveAll = valid.map((row, i) =>
      fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: row.title.trim(),
          status: linkedNoteId ? "inbox" : status,
          priority: row.priority,
          due_date: row.dueDate ? new Date(row.dueDate).toISOString() : null,
          linked_note_id: linkedNoteId ?? null,
          created_from: linkedNoteId ? "note" : "manual",
        }),
      })
        .then((r) => r.ok ? r.json() : null)
        .then((real) => ({ tempId: optimistic[i].id, real }))
        .catch(() => ({ tempId: optimistic[i].id, real: null }))
    )

    Promise.allSettled(saveAll).then((settled) => {
      const pairs = settled
        .filter((r) => r.status === "fulfilled")
        .map((r) => (r as PromiseFulfilledResult<{ tempId: string; real: TaskWithEntities | null }>).value)
      onBackgroundResolved?.(pairs)
    })
  }

  const anyValid = rows.some((r) => r.title.trim())

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
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "560px",
          padding: "22px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "var(--text-1)" }}>
            New Tasks
          </p>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--text-3)", padding: "4px", borderRadius: "6px",
              fontSize: "18px", lineHeight: 1, transition: "color 0.18s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-1)" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)" }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Column row labels */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 108px 66px 20px",
            gap: "8px",
            padding: "0 0 4px",
          }}>
            <span style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 500 }}>Task</span>
            <span style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 500 }}>Due date</span>
            <span style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 500 }}>Priority</span>
            <span />
          </div>

          {/* Task rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {rows.map((row, idx) => (
              <div
                key={row.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 108px 66px 20px",
                  gap: "8px",
                  alignItems: "center",
                }}
              >
                {/* Title */}
                <input
                  ref={(el) => {
                    if (el) rowRefs.current.set(row.id, el)
                    if (idx === 0 && el) firstInputRef.current = el
                  }}
                  type="text"
                  value={row.title}
                  onChange={(e) => updateRow(row.id, { title: e.target.value })}
                  onKeyDown={(e) => handleRowKeyDown(e, row.id, idx)}
                  placeholder="What needs to be done?"
                  style={{
                    width: "100%", padding: "8px 10px",
                    border: "1px solid var(--border)", borderRadius: "7px",
                    background: "var(--bg-surface)", color: "var(--text-1)",
                    fontSize: "14px", outline: "none", boxSizing: "border-box",
                    transition: "border-color 0.18s",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)" }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)" }}
                />

                {/* Date */}
                <input
                  type="date"
                  value={row.dueDate}
                  onChange={(e) => updateRow(row.id, { dueDate: e.target.value })}
                  style={{
                    width: "100%", padding: "8px 8px",
                    border: "1px solid var(--border)", borderRadius: "7px",
                    background: "var(--bg-surface)",
                    color: row.dueDate ? "var(--text-1)" : "var(--text-3)",
                    fontSize: "13px", outline: "none", boxSizing: "border-box",
                    transition: "border-color 0.18s",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)" }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)" }}
                />

                {/* Priority */}
                <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                  {PRIORITIES.map((p) => {
                    const active = row.priority === p.value
                    return (
                      <button
                        key={p.value}
                        type="button"
                        title={p.value}
                        onClick={() => updateRow(row.id, { priority: p.value })}
                        style={{
                          width: "20px", height: "20px", borderRadius: "50%",
                          border: `2px solid ${active ? p.color : "var(--border)"}`,
                          background: active ? p.color : "transparent",
                          cursor: "pointer", padding: 0, fontSize: "9px",
                          color: active ? "#fff" : "var(--text-3)",
                          fontWeight: 700, lineHeight: "16px",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "all 0.15s",
                          flexShrink: 0,
                        }}
                      >
                        {p.label}
                      </button>
                    )
                  })}
                </div>

                {/* Delete row */}
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  disabled={rows.length === 1}
                  style={{
                    background: "transparent", border: "none", cursor: rows.length > 1 ? "pointer" : "default",
                    color: "var(--text-3)", fontSize: "16px", lineHeight: 1, padding: "0",
                    opacity: rows.length === 1 ? 0 : 1, transition: "opacity 0.15s, color 0.15s",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                  onMouseEnter={(e) => { if (rows.length > 1) e.currentTarget.style.color = "#DC2626" }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)" }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Add another task */}
          <button
            type="button"
            onClick={addRow}
            style={{
              alignSelf: "flex-start", background: "transparent", border: "none",
              cursor: "pointer", color: "var(--text-3)", fontSize: "13px",
              padding: "4px 0", display: "flex", alignItems: "center", gap: "5px",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)" }}
          >
            <span style={{ fontSize: "16px", lineHeight: 1 }}>+</span>
            Add task
          </button>

          {/* Column selector */}
          {!linkedNoteId && (
            <div>
              <label style={{ display: "block", fontSize: "11px", color: "var(--text-3)", marginBottom: "6px", fontWeight: 500 }}>
                Column
              </label>
              <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                {STATUSES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStatus(s.value)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "6px",
                      fontSize: "12px",
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

          {/* Actions */}
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", paddingTop: "4px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 16px", borderRadius: "8px", fontSize: "14px",
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--text-2)", cursor: "pointer",
                transition: "color 0.18s, border-color 0.18s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-1)"; e.currentTarget.style.borderColor = "var(--text-3)" }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-2)"; e.currentTarget.style.borderColor = "var(--border)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!anyValid}
              style={{
                padding: "8px 18px", borderRadius: "8px", fontSize: "14px", fontWeight: 500,
                border: "none",
                background: anyValid ? "var(--accent)" : "var(--border)",
                color: anyValid ? "#fff" : "var(--text-3)",
                cursor: anyValid ? "pointer" : "not-allowed",
                transition: "background 0.18s, color 0.18s",
              }}
            >
              Create {rows.filter((r) => r.title.trim()).length > 1
                ? `${rows.filter((r) => r.title.trim()).length} Tasks`
                : "Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
