"use client"

import { useCallback, useEffect, useState } from "react"
import type { TaskStatus, TaskPriority, TaskWithEntities } from "@/lib/tasks"
import CreateTaskModal from "./CreateTaskModal"

// ── Constants ─────────────────────────────────────────────────────────────────

const COLUMNS: Array<{ status: TaskStatus; label: string }> = [
  { status: "inbox", label: "Inbox" },
  { status: "next", label: "Next" },
  { status: "doing", label: "Doing" },
  { status: "waiting", label: "Waiting" },
  { status: "done", label: "Done" },
]

const PRIORITY_DOT: Record<TaskPriority, string> = {
  high: "#DC2626",
  medium: "#D97706",
  low: "#9CA3AF",
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDueDate(iso: string): { label: string; overdue: boolean } {
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  if (d.getTime() === today.getTime()) return { label: "Today", overdue: false }
  if (d.getTime() === tomorrow.getTime()) return { label: "Tomorrow", overdue: false }
  if (d < today) return { label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), overdue: true }
  return { label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), overdue: false }
}

// ── TaskCardItem ──────────────────────────────────────────────────────────────

function TaskCardItem({
  task,
  onDragStart,
  onDelete,
}: {
  task: TaskWithEntities
  onDragStart: (taskId: string) => void
  onDelete: (taskId: string) => void
}) {
  const visibleEntities = task.entities.slice(0, 3)
  const overflow = task.entities.length - visibleEntities.length
  const dueInfo = task.due_date ? formatDueDate(task.due_date) : null

  return (
    <div
      draggable
      onDragStart={() => onDragStart(task.id)}
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "12px 14px",
        cursor: "grab",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        transition: "box-shadow 0.18s, opacity 0.18s",
        userSelect: "none",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.09)" }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)" }}
    >
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "8px" }}>
        <span
          title={task.priority}
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: PRIORITY_DOT[task.priority],
            flexShrink: 0,
            marginTop: "6px",
          }}
        />
        <p style={{
          margin: 0,
          fontSize: "14px",
          lineHeight: 1.5,
          color: task.status === "done" ? "var(--text-3)" : "var(--text-1)",
          textDecoration: task.status === "done" ? "line-through" : "none",
          flex: 1,
          wordBreak: "break-word",
        }}>
          {task.title}
        </p>
        <button
          onClick={() => onDelete(task.id)}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--text-3)",
            padding: "2px",
            fontSize: "14px",
            lineHeight: 1,
            borderRadius: "4px",
            flexShrink: 0,
            opacity: 0,
            transition: "opacity 0.18s, color 0.18s",
          }}
          className="task-delete-btn"
          onMouseEnter={(e) => { e.currentTarget.style.color = "#DC2626" }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)" }}
          title="Delete task"
        >
          ×
        </button>
      </div>

      {/* Meta row */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        {/* Due date */}
        {dueInfo && (
          <span style={{
            fontSize: "11px",
            color: dueInfo.overdue ? "#DC2626" : "var(--text-3)",
            fontWeight: dueInfo.overdue ? 500 : 400,
            display: "flex",
            alignItems: "center",
            gap: "3px",
          }}>
            {dueInfo.overdue ? "⚠ " : ""}
            {dueInfo.label}
          </span>
        )}

        {/* Linked note icon */}
        {task.linked_note_id && (
          <span title="Linked to a note" style={{ color: "var(--text-3)", fontSize: "11px" }}>
            📄
          </span>
        )}

        {/* Entity badges */}
        {visibleEntities.map((e) => (
          <span
            key={e.id}
            style={{
              fontSize: "11px",
              padding: "2px 7px",
              borderRadius: "999px",
              background: "rgba(91,110,174,0.08)",
              color: "var(--accent)",
              border: "1px solid rgba(91,110,174,0.16)",
              whiteSpace: "nowrap",
            }}
          >
            {e.name}
          </span>
        ))}
        {overflow > 0 && (
          <span style={{ fontSize: "11px", color: "var(--text-3)" }}>+{overflow}</span>
        )}
      </div>
    </div>
  )
}

// ── TaskColumn ────────────────────────────────────────────────────────────────

function TaskColumn({
  status,
  label,
  tasks,
  isDragOver,
  onDragOver,
  onDrop,
  onDragLeave,
  onDragStart,
  onDelete,
}: {
  status: TaskStatus
  label: string
  tasks: TaskWithEntities[]
  isDragOver: boolean
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDragStart: (taskId: string) => void
  onDelete: (taskId: string) => void
}) {
  const wipWarning = status === "doing" && tasks.length > 3

  return (
    <div
      style={{
        width: "280px",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: "0",
      }}
    >
      {/* Column header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginBottom: "10px",
        padding: "0 2px",
      }}>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-2)", letterSpacing: "0.02em" }}>
          {label}
        </span>
        <span style={{
          fontSize: "11px",
          padding: "1px 7px",
          borderRadius: "999px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          color: "var(--text-3)",
          fontWeight: 500,
        }}>
          {tasks.length}
        </span>
        {wipWarning && (
          <span title="Work in progress: more than 3 tasks" style={{ fontSize: "11px", color: "#D97706" }}>
            ⚡ WIP
          </span>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragLeave={onDragLeave}
        style={{
          flex: 1,
          minHeight: "200px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          padding: "8px",
          borderRadius: "10px",
          border: `2px dashed ${isDragOver ? "var(--accent)" : "transparent"}`,
          background: isDragOver ? "var(--accent-dim)" : "var(--bg-surface)",
          transition: "border-color 0.18s, background 0.18s",
        }}
      >
        {tasks.map((task) => (
          <TaskCardItem
            key={task.id}
            task={task}
            onDragStart={onDragStart}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskWithEntities[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null)

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks")
      if (!res.ok) throw new Error("Failed to load")
      const data: TaskWithEntities[] = await res.json()
      setTasks(data)
    } catch {
      // silently fail — board stays empty
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  function moveTask(taskId: string, newStatus: TaskStatus) {
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: newStatus } : t))
    fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    }).catch(() => fetchTasks())
  }

  function deleteTask(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    fetch(`/api/tasks/${taskId}`, { method: "DELETE" })
      .catch(() => fetchTasks())
  }

  function handleDragStart(taskId: string) {
    setDragId(taskId)
  }

  function handleDragOver(e: React.DragEvent, status: TaskStatus) {
    e.preventDefault()
    setDragOver(status)
  }

  function handleDrop(e: React.DragEvent, status: TaskStatus) {
    e.preventDefault()
    if (dragId) {
      const task = tasks.find((t) => t.id === dragId)
      if (task && task.status !== status) moveTask(dragId, status)
    }
    setDragId(null)
    setDragOver(null)
  }

  function handleDragEnd() {
    setDragId(null)
    setDragOver(null)
  }

  const totalActive = tasks.filter((t) => t.status !== "done").length

  return (
    <div
      className="page-fade-in"
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        padding: "40px 32px 40px",
        display: "flex",
        flexDirection: "column",
      }}
      onDragEnd={handleDragEnd}
    >
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        marginBottom: "32px",
        maxWidth: "1500px",
      }}>
        <div>
          <h1 style={{
            margin: "0 0 4px",
            fontSize: "22px",
            fontWeight: 600,
            color: "var(--text-1)",
            letterSpacing: "-0.02em",
          }}>
            Tasks
          </h1>
          {!loading && (
            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-3)" }}>
              {totalActive} active
            </p>
          )}
        </div>

        <button
          onClick={() => setShowModal(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "9px 16px",
            borderRadius: "8px",
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
            transition: "opacity 0.18s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88" }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1" }}
        >
          + New Task
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ color: "var(--text-3)", fontSize: "14px", padding: "48px 0" }}>
          Loading…
        </div>
      )}

      {/* Board */}
      {!loading && (
        <div style={{
          display: "flex",
          gap: "16px",
          overflowX: "auto",
          paddingBottom: "24px",
          alignItems: "flex-start",
        }}>
          {COLUMNS.map(({ status, label }) => {
            const columnTasks = tasks.filter((t) => t.status === status)
            return (
              <TaskColumn
                key={status}
                status={status}
                label={label}
                tasks={columnTasks}
                isDragOver={dragOver === status}
                onDragOver={(e) => handleDragOver(e, status)}
                onDrop={(e) => handleDrop(e, status)}
                onDragLeave={() => setDragOver(null)}
                onDragStart={handleDragStart}
                onDelete={deleteTask}
              />
            )
          })}
        </div>
      )}

      {/* Show delete button on card hover (CSS trick via inline style injection) */}
      <style>{`
        div:hover > div > .task-delete-btn,
        div:hover > .task-delete-btn {
          opacity: 1 !important;
        }
      `}</style>

      {showModal && (
        <CreateTaskModal
          onClose={() => setShowModal(false)}
          onCreated={(task) => {
            setTasks((prev) => [task, ...prev])
            setShowModal(false)
          }}
        />
      )}
    </div>
  )
}
