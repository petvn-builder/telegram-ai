"use client"

import { useState } from "react"
import useSWR from "swr"
import type { TaskStatus, TaskPriority, TaskWithEntities } from "@/lib/tasks"
import { fetcher } from "@/lib/fetcher"
import CreateTaskModal from "./CreateTaskModal"
import TaskDetailModal from "./TaskDetailModal"

// ── Constants ─────────────────────────────────────────────────────────────────

// Logical order used for ← → arrow navigation
const COLUMNS: Array<{ status: TaskStatus; label: string }> = [
  { status: "inbox",   label: "Inbox"   },
  { status: "next",    label: "Next"    },
  { status: "doing",   label: "Doing"   },
  { status: "waiting", label: "Waiting" },
  { status: "done",    label: "Done"    },
]

// Visual layout: 3 outer columns, some stacked
const BOARD_LAYOUT: Array<Array<{ status: TaskStatus; label: string }>> = [
  [{ status: "next", label: "Next" }, { status: "inbox", label: "Inbox" }],
  [{ status: "doing", label: "Doing" }],
  [{ status: "done", label: "Done" }, { status: "waiting", label: "Waiting" }],
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
  onCheck,
  onMoveBack,
  onMoveForward,
  onClick,
  canMoveBack,
  canMoveForward,
}: {
  task: TaskWithEntities
  onDragStart: (taskId: string) => void
  onDelete: (taskId: string) => void
  onCheck: (taskId: string) => void
  onMoveBack: (taskId: string) => void
  onMoveForward: (taskId: string) => void
  onClick: (task: TaskWithEntities) => void
  canMoveBack: boolean
  canMoveForward: boolean
}) {
  const visibleEntities = task.entities.slice(0, 3)
  const overflow = task.entities.length - visibleEntities.length
  const dueInfo = task.due_date ? formatDueDate(task.due_date) : null
  const isDone = task.status === "done"

  return (
    <div
      draggable
      onDragStart={() => onDragStart(task.id)}
      onClick={() => onClick(task)}
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "12px 14px",
        cursor: "pointer",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        transition: "box-shadow 0.18s",
        userSelect: "none",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.09)" }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)" }}
    >
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "8px" }}>
        {/* Checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onCheck(task.id) }}
          title={isDone ? "Mark undone" : "Mark done"}
          style={{
            width: "15px",
            height: "15px",
            borderRadius: "50%",
            border: `2px solid ${isDone ? "var(--accent)" : "var(--border)"}`,
            background: isDone ? "var(--accent)" : "transparent",
            flexShrink: 0,
            marginTop: "3px",
            cursor: "pointer",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.18s",
          }}
        >
          {isDone && (
            <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
              <polyline points="1,4 3,6 7,2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {/* Priority dot */}
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
          color: isDone ? "var(--text-3)" : "var(--text-1)",
          textDecoration: isDone ? "line-through" : "none",
          flex: 1,
          wordBreak: "break-word",
        }}>
          {task.title}
        </p>

        <button
          onClick={(e) => { e.stopPropagation(); onDelete(task.id) }}
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
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
        {/* Back arrow */}
        {canMoveBack && (
          <button
            onClick={(e) => { e.stopPropagation(); onMoveBack(task.id) }}
            title="Move to previous column"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              cursor: "pointer",
              color: "var(--text-3)",
              padding: "1px 5px",
              fontSize: "11px",
              lineHeight: 1.4,
              transition: "color 0.18s, border-color 0.18s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-1)"; e.currentTarget.style.borderColor = "var(--text-3)" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.borderColor = "var(--border)" }}
          >
            ←
          </button>
        )}

        {dueInfo && (
          <span style={{
            fontSize: "11px",
            color: dueInfo.overdue ? "#DC2626" : "var(--text-3)",
            fontWeight: dueInfo.overdue ? 500 : 400,
            display: "flex",
            alignItems: "center",
            gap: "3px",
          }}>
            {dueInfo.overdue ? "⚠ " : ""}{dueInfo.label}
          </span>
        )}

        {task.linked_note_id && (
          <span title="Linked to a note" style={{ color: "var(--text-3)", fontSize: "11px" }}>📄</span>
        )}

        {visibleEntities.map((e) => (
          <span key={e.id} style={{
            fontSize: "11px",
            padding: "2px 7px",
            borderRadius: "999px",
            background: "rgba(91,110,174,0.08)",
            color: "var(--accent)",
            border: "1px solid rgba(91,110,174,0.16)",
            whiteSpace: "nowrap",
          }}>
            {e.name}
          </span>
        ))}
        {overflow > 0 && (
          <span style={{ fontSize: "11px", color: "var(--text-3)" }}>+{overflow}</span>
        )}

        <span style={{ flex: 1 }} />

        {/* Forward arrow */}
        {canMoveForward && (
          <button
            onClick={(e) => { e.stopPropagation(); onMoveForward(task.id) }}
            title="Move to next column"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              cursor: "pointer",
              color: "var(--text-3)",
              padding: "1px 5px",
              fontSize: "11px",
              lineHeight: 1.4,
              transition: "color 0.18s, border-color 0.18s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-1)"; e.currentTarget.style.borderColor = "var(--text-3)" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.borderColor = "var(--border)" }}
          >
            →
          </button>
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
  onCheck,
  onMoveBack,
  onMoveForward,
  onClickTask,
  onAddTask,
  colIndex,
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
  onCheck: (taskId: string) => void
  onMoveBack: (taskId: string) => void
  onMoveForward: (taskId: string) => void
  onClickTask: (task: TaskWithEntities) => void
  onAddTask: () => void
  colIndex: number
}) {
  const wipWarning = status === "doing" && tasks.length > 3
  const canMoveBack = colIndex > 0
  const canMoveForward = colIndex < COLUMNS.length - 1

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      {/* Column header with inline + button */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginBottom: "8px",
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
        <span style={{ flex: 1 }} />
        {/* + Add task button in header */}
        <button
          onClick={onAddTask}
          title={`Add task to ${label}`}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            cursor: "pointer",
            color: "var(--text-3)",
            padding: "2px 8px",
            fontSize: "16px",
            lineHeight: 1.2,
            transition: "color 0.18s, border-color 0.18s, background 0.18s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--accent)"
            e.currentTarget.style.borderColor = "var(--accent)"
            e.currentTarget.style.background = "var(--accent-dim)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-3)"
            e.currentTarget.style.borderColor = "var(--border)"
            e.currentTarget.style.background = "transparent"
          }}
        >
          +
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragLeave={onDragLeave}
        style={{
          flex: 1,
          minHeight: "160px",
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
            onCheck={onCheck}
            onMoveBack={onMoveBack}
            onMoveForward={onMoveForward}
            onClick={onClickTask}
            canMoveBack={canMoveBack}
            canMoveForward={canMoveForward}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const { data: tasks = [], isLoading: loading, mutate } =
    useSWR<TaskWithEntities[]>("/api/tasks", fetcher, {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    })
  const [createInColumn, setCreateInColumn] = useState<TaskStatus | null>(null)
  const [selectedTask, setSelectedTask] = useState<TaskWithEntities | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null)

  function moveTask(taskId: string, newStatus: TaskStatus) {
    mutate(tasks.map((t) => t.id === taskId ? { ...t, status: newStatus } : t), false)
    fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    }).catch(() => mutate())
  }

  function deleteTask(taskId: string) {
    mutate(tasks.filter((t) => t.id !== taskId), false)
    setSelectedTask((prev) => prev?.id === taskId ? null : prev)
    fetch(`/api/tasks/${taskId}`, { method: "DELETE" }).catch(() => mutate())
  }

  function handleCheck(taskId: string) {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    moveTask(taskId, task.status === "done" ? "inbox" : "done")
  }

  function handleMoveBack(taskId: string) {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    const idx = COLUMNS.findIndex((c) => c.status === task.status)
    if (idx > 0) moveTask(taskId, COLUMNS[idx - 1].status)
  }

  function handleMoveForward(taskId: string) {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    const idx = COLUMNS.findIndex((c) => c.status === task.status)
    if (idx < COLUMNS.length - 1) moveTask(taskId, COLUMNS[idx + 1].status)
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

  function handleTaskUpdated(updated: TaskWithEntities) {
    mutate(tasks.map((t) => t.id === updated.id ? updated : t), false)
    setSelectedTask(null)
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
      onDragEnd={() => { setDragId(null); setDragOver(null) }}
    >
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        marginBottom: "32px",
        maxWidth: "1000px",
      }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: "22px", fontWeight: 600, color: "var(--text-1)", letterSpacing: "-0.02em" }}>
            Tasks
          </h1>
          {!loading && (
            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-3)" }}>{totalActive} active</p>
          )}
        </div>

        <button
          onClick={() => setCreateInColumn("inbox")}
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

      {loading && (
        <div style={{ color: "var(--text-3)", fontSize: "14px", padding: "48px 0" }}>Loading…</div>
      )}

      {/* Board — 3 outer columns */}
      {!loading && (
        <div style={{
          display: "flex",
          gap: "20px",
          overflowX: "auto",
          paddingBottom: "24px",
          alignItems: "flex-start",
        }}>
          {BOARD_LAYOUT.map((boardCol, bcIdx) => (
            <div
              key={bcIdx}
              style={{
                width: "300px",
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                gap: "20px",
              }}
            >
              {boardCol.map(({ status, label }) => {
                const colIndex = COLUMNS.findIndex((c) => c.status === status)
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
                    onDragStart={(id) => setDragId(id)}
                    onDelete={deleteTask}
                    onCheck={handleCheck}
                    onMoveBack={handleMoveBack}
                    onMoveForward={handleMoveForward}
                    onClickTask={setSelectedTask}
                    onAddTask={() => setCreateInColumn(status)}
                    colIndex={colIndex}
                  />
                )
              })}
            </div>
          ))}
        </div>
      )}

      <style>{`
        div:hover > div > .task-delete-btn,
        div:hover > .task-delete-btn {
          opacity: 1 !important;
        }
      `}</style>

      {createInColumn !== null && (
        <CreateTaskModal
          onClose={() => setCreateInColumn(null)}
          initialStatus={createInColumn}
          onCreated={(task) => {
            mutate([task, ...tasks], false)
            setCreateInColumn(null)
          }}
        />
      )}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdated={handleTaskUpdated}
          onDeleted={deleteTask}
        />
      )}
    </div>
  )
}
