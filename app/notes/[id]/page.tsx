"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import type { NoteDetail, TaskWithEntities, TaskStatus } from "../types"
import CreateTaskModal from "@/app/tasks/CreateTaskModal"
import { useAiPanel } from "@/app/components/AiPanelContext"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

// Light-appropriate entity colors
const ENTITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  person:   { bg: "rgba(37,99,235,0.09)",    text: "#1D4ED8", border: "rgba(37,99,235,0.18)"   },
  project:  { bg: "rgba(109,40,217,0.09)",   text: "#6D28D9", border: "rgba(109,40,217,0.18)"  },
  company:  { bg: "rgba(180,83,9,0.09)",     text: "#B45309", border: "rgba(180,83,9,0.18)"    },
  tool:     { bg: "rgba(4,120,87,0.09)",     text: "#047857", border: "rgba(4,120,87,0.18)"    },
  topic:    { bg: "rgba(67,56,202,0.09)",    text: "#3730A3", border: "rgba(67,56,202,0.18)"   },
  goal:     { bg: "rgba(190,24,93,0.09)",    text: "#BE185D", border: "rgba(190,24,93,0.18)"   },
  event:    { bg: "rgba(194,65,12,0.09)",    text: "#C2410C", border: "rgba(194,65,12,0.18)"   },
  resource: { bg: "rgba(15,118,110,0.09)",   text: "#0F766E", border: "rgba(15,118,110,0.18)"  },
}

function entityColor(type: string) {
  return ENTITY_COLORS[type] ?? {
    bg: "rgba(107,114,128,0.09)",
    text: "var(--text-2)",
    border: "rgba(107,114,128,0.18)",
  }
}

function SkeletonLine({ width }: { width: string }) {
  return (
    <div
      className="skeleton"
      style={{ height: "14px", borderRadius: "6px", width, marginBottom: "12px" }}
    />
  )
}

const STATUS_DOT: Record<string, string> = {
  inbox: "#9CA3AF",
  next: "#3B82F6",
  doing: "#F59E0B",
  waiting: "#8B5CF6",
  done: "#10B981",
}

function RelatedTaskRow({
  task,
  onStatusChange,
}: {
  task: TaskWithEntities
  onStatusChange: (s: TaskStatus) => void
}) {
  const dueDate = task.due_date
    ? new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "8px 0",
      borderBottom: "1px solid var(--border-subtle)",
    }}>
      <span
        title={task.status}
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: STATUS_DOT[task.status] ?? "#9CA3AF",
          flexShrink: 0,
        }}
      />
      <span style={{
        flex: 1,
        fontSize: "14px",
        color: task.status === "done" ? "var(--text-3)" : "var(--text-1)",
        textDecoration: task.status === "done" ? "line-through" : "none",
      }}>
        {task.title}
      </span>
      {dueDate && (
        <span style={{ fontSize: "12px", color: "var(--text-3)" }}>{dueDate}</span>
      )}
      <select
        value={task.status}
        onChange={(e) => onStatusChange(e.target.value as TaskStatus)}
        style={{
          fontSize: "12px",
          color: "var(--text-2)",
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: "6px",
          padding: "2px 6px",
          cursor: "pointer",
        }}
      >
        {(["inbox", "next", "doing", "waiting", "done"] as TaskStatus[]).map((s) => (
          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
        ))}
      </select>
    </div>
  )
}

export default function NoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { sendCommand } = useAiPanel()
  const [note, setNote] = useState<NoteDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [relatedTasks, setRelatedTasks] = useState<TaskWithEntities[]>([])
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState("")
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    fetch(`/api/notes/${id}`)
      .then((res) => {
        if (res.status === 404) throw new Error("Note not found")
        if (!res.ok) throw new Error("Failed to load note")
        return res.json()
      })
      .then((data: NoteDetail) => setNote(data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!note) return
    fetch(`/api/tasks?note_id=${note.id}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setRelatedTasks)
      .catch(() => {})
  }, [note])

  async function handleSaveEdit() {
    if (!note || editSaving) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      })
      if (res.ok) {
        setNote({ ...note, content: editContent })
        setIsEditing(false)
      }
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div
      className="page-fade-in"
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        padding: "48px 48px",
      }}
    >
      <div style={{ maxWidth: "680px" }}>

        {/* Back */}
        <Link
          href="/notes"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "14px",
            color: "var(--text-3)",
            textDecoration: "none",
            marginBottom: "36px",
            transition: "color 0.16s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-2)" }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-3)" }}
        >
          ← Notes
        </Link>

        {/* Loading */}
        {loading && (
          <div style={{ paddingTop: "8px" }}>
            <SkeletonLine width="25%" />
            <div style={{ marginTop: "20px" }}>
              <SkeletonLine width="100%" />
              <SkeletonLine width="90%" />
              <SkeletonLine width="95%" />
              <SkeletonLine width="65%" />
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{
            padding: "48px 0",
            textAlign: "center",
          }}>
            <p style={{ fontSize: "15px", color: "#DC2626", margin: "0 0 16px" }}>{error}</p>
            <Link
              href="/notes"
              style={{ fontSize: "14px", color: "var(--text-2)", textDecoration: "none" }}
            >
              ← Back to Notes
            </Link>
          </div>
        )}

        {/* Content */}
        {!loading && note && (
          <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>

            {/* Main content — no card wrapper, feels like paper */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
                <p style={{ fontSize: "13px", color: "var(--text-3)", margin: 0 }}>
                  {formatDate(note.created_at)}
                </p>
                {!isEditing && (
                  <button
                    onClick={() => { setIsEditing(true); setEditContent(note.content) }}
                    title="Edit note"
                    style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "13px", color: "var(--text-3)", background: "transparent", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: "6px", transition: "color 0.15s, background 0.15s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-1)"; e.currentTarget.style.background = "var(--bg-elevated)" }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.background = "transparent" }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Edit
                  </button>
                )}
              </div>

              {isEditing ? (
                <div>
                  <textarea
                    autoFocus
                    value={editContent}
                    onChange={(e) => {
                      setEditContent(e.target.value)
                      e.target.style.height = "auto"
                      e.target.style.height = e.target.scrollHeight + "px"
                    }}
                    ref={(el) => {
                      if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px" }
                    }}
                    style={{
                      width: "100%", fontSize: "17px", lineHeight: 1.8, color: "var(--text-1)",
                      background: "transparent", border: "none", outline: "none", resize: "none",
                      padding: 0, boxSizing: "border-box", overflow: "hidden", minHeight: "120px",
                      fontFamily: "inherit", whiteSpace: "pre-wrap",
                    }}
                  />
                  <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                    <button
                      onClick={handleSaveEdit}
                      disabled={editSaving}
                      style={{ padding: "8px 20px", borderRadius: "8px", fontSize: "14px", fontWeight: 600, background: "var(--accent)", color: "#fff", border: "none", cursor: editSaving ? "default" : "pointer", opacity: editSaving ? 0.7 : 1, transition: "opacity 0.15s" }}
                    >
                      {editSaving ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      style={{ padding: "8px 16px", borderRadius: "8px", fontSize: "14px", color: "var(--text-2)", background: "transparent", border: "none", cursor: "pointer", transition: "color 0.15s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-1)" }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-2)" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: "17px", lineHeight: 1.8, color: "var(--text-1)", whiteSpace: "pre-wrap", margin: 0 }}>
                  {note.content}
                </p>
              )}
            </div>

            {/* AI Actions */}
            <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "20px" }}>
              <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--ai-accent)", margin: "0 0 10px", display: "flex", alignItems: "center", gap: "5px", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
                </svg>
                AI
              </p>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {[
                  { label: "Summarize", cmd: `summarize note: ${note.content.slice(0, 120)}` },
                  { label: "Create tasks", cmd: `create tasks from: ${note.content.slice(0, 120)}` },
                  { label: "Find related", cmd: `find notes about: ${note.content.split("\n")[0].slice(0, 60)}` },
                ].map(({ label, cmd }) => (
                  <button
                    key={label}
                    onClick={() => sendCommand(cmd)}
                    style={{
                      padding: "5px 12px",
                      background: "var(--ai-accent-dim)",
                      border: "1px solid var(--ai-border)",
                      borderRadius: "7px",
                      fontSize: "12px",
                      color: "var(--ai-accent)",
                      cursor: "pointer",
                      transition: "background 0.16s, color 0.16s",
                      fontWeight: 500,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--ai-accent-glow)"
                      e.currentTarget.style.color = "var(--ai-accent)"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "var(--ai-accent-dim)"
                      e.currentTarget.style.color = "var(--ai-accent)"
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Entities */}
            {note.relatedEntities.length > 0 && (
              <div style={{
                borderTop: "1px solid var(--border-subtle)",
                paddingTop: "24px",
              }}>
                <p style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--text-3)",
                  margin: "0 0 14px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}>
                  Linked Entities
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {note.relatedEntities.map((entity) => {
                    const c = entityColor(entity.type)
                    return (
                      <Link
                        key={entity.id}
                        href="/graph"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "4px 12px",
                          borderRadius: "999px",
                          fontSize: "13px",
                          fontWeight: 500,
                          background: c.bg,
                          color: c.text,
                          border: `1px solid ${c.border}`,
                          textDecoration: "none",
                          transition: "opacity 0.16s",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.75" }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1" }}
                      >
                        {entity.name}
                        <span style={{ opacity: 0.5, fontSize: "11px" }}>{entity.type}</span>
                      </Link>
                    )
                  })}
                </div>

                <Link
                  href="/graph"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    marginTop: "16px",
                    fontSize: "13px",
                    color: "var(--accent)",
                    textDecoration: "none",
                    gap: "4px",
                    transition: "opacity 0.16s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7" }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1" }}
                >
                  View in Knowledge Graph →
                </Link>
              </div>
            )}

            {/* Related Tasks */}
            <div style={{
              borderTop: "1px solid var(--border-subtle)",
              paddingTop: "24px",
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "14px",
              }}>
                <p style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--text-3)",
                  margin: 0,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}>
                  Tasks {relatedTasks.length > 0 && `· ${relatedTasks.length}`}
                </p>
                <button
                  onClick={() => setShowTaskModal(true)}
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "var(--accent)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "3px 8px",
                    borderRadius: "6px",
                    transition: "background 0.16s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--accent-dim)" }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
                >
                  + New Task
                </button>
              </div>

              {relatedTasks.length === 0 ? (
                <p style={{ margin: 0, fontSize: "13px", color: "var(--text-3)" }}>
                  No tasks yet.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {relatedTasks.map((task) => (
                    <RelatedTaskRow
                      key={task.id}
                      task={task}
                      onStatusChange={(newStatus) => {
                        setRelatedTasks((prev) =>
                          prev.map((t) => t.id === task.id ? { ...t, status: newStatus } : t)
                        )
                        fetch(`/api/tasks/${task.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: newStatus }),
                        }).catch(() => {})
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showTaskModal && note && (
        <CreateTaskModal
          linkedNoteId={note.id}
          initialTitle={note.content.split("\n")[0].slice(0, 80)}
          onClose={() => setShowTaskModal(false)}
          onCreated={(task) => {
            setRelatedTasks((prev) => [task, ...prev])
            setShowTaskModal(false)
          }}
        />
      )}
    </div>
  )
}
