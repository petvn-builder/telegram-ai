"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import type { Entity, Space, NoteWithEntities, TaskWithEntities } from "./types"
import NoteComposer from "./NoteComposer"

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function titleAndBody(content: string): { title: string; body: string } {
  const trimmed = content.trim()
  const newlineIdx = trimmed.indexOf("\n")
  if (newlineIdx === -1) {
    return { title: trimmed.slice(0, 100), body: "" }
  }
  const title = trimmed.slice(0, newlineIdx).slice(0, 100)
  const body = trimmed.slice(newlineIdx + 1).trim().replace(/\n+/g, " ").slice(0, 140)
  return { title, body }
}

const SPACE_STYLE = {
  bg: "var(--accent-dim)",
  text: "var(--accent)",
  border: "var(--border-accent)",
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      style={{
        padding: "20px 24px",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div className="skeleton" style={{ height: "15px", borderRadius: "6px", width: "65%" }} />
      <div className="skeleton" style={{ height: "13px", borderRadius: "6px", width: "85%" }} />
      <div className="skeleton" style={{ height: "11px", borderRadius: "6px", width: "100px" }} />
    </div>
  )
}

interface NoteCardProps {
  note: NoteWithEntities
  selected: boolean
  onClick: () => void
  isLast: boolean
}

function NoteCard({ note, selected, onClick, isLast }: NoteCardProps) {
  const [hovered, setHovered] = useState(false)
  const { title, body } = titleAndBody(note.content)
  const spaceName = note.spaces?.[0]?.name ?? null

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        textAlign: "left",
        background: selected ? "var(--accent-dim)" : hovered ? "var(--bg-hover)" : "transparent",
        borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
        borderTop: "none",
        borderRight: "none",
        borderLeft: selected ? "2px solid var(--accent)" : "2px solid transparent",
        borderRadius: "0",
        padding: "20px 24px",
        cursor: "pointer",
        transition: "background 0.16s ease-in-out, border-color 0.16s ease-in-out",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      {/* Title */}
      <p
        style={{
          fontSize: "15px",
          fontWeight: 500,
          lineHeight: 1.4,
          color: "var(--text-1)",
          margin: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {title || "Untitled"}
      </p>

      {/* Body preview */}
      {body && (
        <p
          style={{
            fontSize: "14px",
            lineHeight: 1.6,
            color: "var(--text-2)",
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {body}
        </p>
      )}

      {/* Metadata row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginTop: "2px",
        }}
      >
        {spaceName && (
          <>
            <span style={{ fontSize: "11px", color: "var(--accent)", fontWeight: 500 }}>
              @{spaceName}
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-3)" }}>·</span>
          </>
        )}
        <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
          {relativeTime(note.created_at)}
        </span>
      </div>
    </button>
  )
}

// ── EntityTag ─────────────────────────────────────────────────────────────────

interface EntityTagProps {
  label: string
  count: number
  active: boolean
  onClick: () => void
}

function EntityTag({ label, count, active, onClick }: EntityTagProps) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "6px 12px",
        borderRadius: "999px",
        fontSize: "13px",
        fontWeight: 500,
        whiteSpace: "nowrap",
        flexShrink: 0,
        cursor: "pointer",
        background: active
          ? "var(--accent-dim)"
          : hovered
          ? "var(--bg-elevated)"
          : "var(--bg-hover)",
        borderTop: "1px solid transparent",
        borderRight: "1px solid transparent",
        borderBottom: "1px solid transparent",
        borderLeft: active ? "2px solid var(--accent)" : "1px solid transparent",
        color: active ? "var(--text-1)" : "var(--text-2)",
        transition: "background 0.16s ease-in-out, color 0.16s ease-in-out",
      }}
    >
      {label}
      <span style={{ fontSize: "12px", opacity: 0.65 }}>{count}</span>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const DETAIL_W = 400

export default function NotesPage() {
  return (
    <Suspense>
      <NotesPageInner />
    </Suspense>
  )
}

function NotesPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeSpaceId = searchParams.get("space")

  const [notes, setNotes] = useState<NoteWithEntities[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNote, setSelectedNote] = useState<NoteWithEntities | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [showComposer, setShowComposer] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Panel auto-save
  const [panelText, setPanelText] = useState("")
  const [panelSaving, setPanelSaving] = useState(false)
  const [panelSaved, setPanelSaved] = useState(false)
  // Panel tasks
  const [noteTasks, setNoteTasks] = useState<TaskWithEntities[]>([])
  const [taskTitle, setTaskTitle] = useState("")
  const [taskDue, setTaskDue] = useState("")
  const [addingTask, setAddingTask] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [activeSpaceName, setActiveSpaceName] = useState<string | null>(null)
  const [activeEntityId, setActiveEntityId] = useState<string | null>(searchParams.get("entity"))
  const [groupByEntity, setGroupByEntity] = useState(false)
  const [listFading, setListFading] = useState(false)
  const detailRef = useRef<HTMLDivElement>(null)
  const composerTopRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const justAddedId = useRef<string | null>(null)
  const confirmDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLoading(true)
    setNotes([])
    setSelectedNote(null)
    setActiveSpaceName(null)

    const url = activeSpaceId ? `/api/notes?spaceId=${activeSpaceId}` : "/api/notes"

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load notes")
        return r.json()
      })
      .then((data: NoteWithEntities[]) => {
        setNotes(data)
        if (activeSpaceId && data.length > 0) {
          const space = data[0].spaces?.find((s) => s.id === activeSpaceId)
          if (space) setActiveSpaceName(space.name)
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [activeSpaceId])

  useEffect(() => {
    if (!activeSpaceId || activeSpaceName) return
    fetch("/api/spaces")
      .then((r) => r.ok ? r.json() : [])
      .then((spaces: { id: string; name: string }[]) => {
        const found = spaces.find((s) => s.id === activeSpaceId)
        if (found) setActiveSpaceName(found.name)
      })
      .catch(() => {})
  }, [activeSpaceId, activeSpaceName])

  useEffect(() => {
    setActiveEntityId(searchParams.get("entity"))
  }, [searchParams])

  // Aggregate entities across all notes, sorted by note count descending
  const entityStats = useMemo(() => {
    const map = new Map<string, { entity: Entity; count: number; notes: NoteWithEntities[] }>()
    for (const note of notes) {
      for (const entity of note.entities) {
        const entry = map.get(entity.id)
        if (entry) {
          entry.count++
          entry.notes.push(note)
        } else {
          map.set(entity.id, { entity, count: 1, notes: [note] })
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [notes])

  const filteredNotes = useMemo(() => {
    let result = notes
    if (searchQuery) {
      result = result.filter((n) =>
        n.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    if (activeEntityId) {
      result = result.filter((n) => n.entities.some((e) => e.id === activeEntityId))
    }
    return result
  }, [notes, searchQuery, activeEntityId])

  function setEntityFilter(entityId: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (entityId) params.set("entity", entityId)
    else params.delete("entity")
    router.push(`/notes?${params}`, { scroll: false })
    setActiveEntityId(entityId)
    scrollContainerRef.current?.scrollTo({ top: 0 })
  }

  function toggleGroupMode() {
    setListFading(true)
    setTimeout(() => {
      setGroupByEntity((prev) => !prev)
      setListFading(false)
    }, 120)
  }

  function handleNoteClick(note: NoteWithEntities) {
    setSelectedNote((prev) => (prev?.id === note.id ? null : note))
  }

  async function handleDelete() {
    if (!selectedNote || deleting) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      confirmDeleteTimerRef.current = setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    if (confirmDeleteTimerRef.current) clearTimeout(confirmDeleteTimerRef.current)
    setDeleting(true)
    try {
      const res = await fetch(`/api/notes/${selectedNote.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setNotes((prev) => prev.filter((n) => n.id !== selectedNote.id))
      setSelectedNote(null)
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  useEffect(() => {
    if (selectedNote && detailRef.current) {
      detailRef.current.classList.remove("panel-slide-in")
      void detailRef.current.offsetWidth
      detailRef.current.classList.add("panel-slide-in")
    }
    setConfirmDelete(false)
    setDeleting(false)
    if (selectedNote) {
      setPanelText(selectedNote.content)
      setPanelSaved(false)
      setTaskTitle("")
      setTaskDue("")
      setNoteTasks([])
      fetch(`/api/tasks?note_id=${selectedNote.id}`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setNoteTasks)
        .catch(() => {})
    }
  }, [selectedNote?.id])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  function scheduleSave(text: string) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setPanelSaved(false)
    saveTimerRef.current = setTimeout(() => doSave(text), 1500)
  }

  async function doSave(text: string) {
    if (!selectedNote) return
    setPanelSaving(true)
    try {
      const res = await fetch(`/api/notes/${selectedNote.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, spaces: [] }),
      })
      if (res.ok) {
        const updated: NoteWithEntities = await res.json()
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))
        setSelectedNote(updated)
        setPanelSaved(true)
      }
    } finally {
      setPanelSaving(false)
    }
  }

  async function handleAddTask() {
    if (!taskTitle.trim() || !selectedNote || addingTask) return
    setAddingTask(true)
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskTitle.trim(),
          due_date: taskDue || null,
          linked_note_id: selectedNote.id,
          status: "inbox",
        }),
      })
      if (res.ok) {
        const task: TaskWithEntities = await res.json()
        setNoteTasks((prev) => [...prev, task])
        setTaskTitle("")
        setTaskDue("")
      }
    } finally {
      setAddingTask(false)
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderCards(items: NoteWithEntities[]) {
    return items.map((note, idx) => {
      const isNew = note.id === justAddedId.current
      return (
        <div
          key={note.id}
          style={isNew ? { animation: "fadeInUp 180ms ease-in-out both" } : undefined}
          onAnimationEnd={() => { if (isNew) justAddedId.current = null }}
        >
          <NoteCard
            note={note}
            selected={selectedNote?.id === note.id}
            onClick={() => handleNoteClick(note)}
            isLast={idx === items.length - 1}
          />
        </div>
      )
    })
  }

  function renderGrouped() {
    return entityStats.map(({ entity, notes: entityNotes }) => {
      // When an entity filter is active, skip all other entity sections
      if (activeEntityId && activeEntityId !== entity.id) return null
      // Apply search filter within this group
      const items = searchQuery
        ? entityNotes.filter((n) =>
            n.content.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : entityNotes
      if (items.length === 0) return null
      return (
        <div key={entity.id}>
          <div
            style={{
              position: "sticky",
              top: 0,
              background: "var(--bg-base)",
              zIndex: 2,
              padding: "12px 24px 8px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "baseline",
              gap: "6px",
            }}
          >
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-1)" }}>
              {entity.name}
            </span>
            <span style={{ fontSize: "13px", color: "var(--text-3)" }}>({items.length})</span>
          </div>
          {renderCards(items)}
        </div>
      )
    })
  }

  function renderMain() {
    if (loading) {
      return (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )
    }

    if (error) {
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "200px",
            color: "#DC2626",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )
    }

    if (filteredNotes.length === 0) {
      const activeEntityName = activeEntityId
        ? entityStats.find((s) => s.entity.id === activeEntityId)?.entity.name
        : null
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "300px",
            gap: "12px",
            color: "var(--text-3)",
          }}
        >
          <span style={{ fontSize: "24px", opacity: 0.4 }}>◌</span>
          <p style={{ fontSize: "15px", margin: 0, color: "var(--text-2)" }}>
            {activeEntityName
              ? `No notes linked to ${activeEntityName} yet`
              : searchQuery
              ? "No notes match your search"
              : activeSpaceId
              ? `No notes in ${activeSpaceName ? `@${activeSpaceName}` : "this space"} yet`
              : "No notes saved yet"}
          </p>
          {activeEntityName && (
            <button
              onClick={() => setShowComposer(true)}
              style={{
                fontSize: "13px",
                color: "var(--accent)",
                background: "transparent",
                border: "1px solid var(--border-accent)",
                borderRadius: "8px",
                padding: "6px 14px",
                cursor: "pointer",
                transition: "opacity 0.16s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.7" }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1" }}
            >
              Create note mentioning {activeEntityName}
            </button>
          )}
          {!searchQuery && !activeSpaceId && !activeEntityName && (
            <p style={{ fontSize: "13px", margin: 0, color: "var(--text-3)" }}>
              Use{" "}
              <code
                style={{
                  fontFamily: "var(--font-geist-mono)",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  padding: "1px 6px",
                  borderRadius: "4px",
                }}
              >
                /save
              </code>{" "}
              in Telegram
            </p>
          )}
        </div>
      )
    }

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          opacity: listFading ? 0 : 1,
          transition: "opacity 150ms ease-in-out",
        }}
      >
        {groupByEntity ? renderGrouped() : renderCards(filteredNotes)}
      </div>
    )
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  const showEntityTags = !loading && entityStats.length > 0

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "var(--bg-base)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Content column */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "padding-right 0.22s ease-in-out",
          paddingRight: selectedNote ? `${DETAIL_W}px` : "0",
        }}
      >
        {/* Page header */}
        <div style={{ padding: "32px 32px 0", flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              marginBottom: showEntityTags ? "16px" : "24px",
            }}
          >
            {/* Title / breadcrumb */}
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              {activeSpaceId ? (
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                  <Link
                    href="/notes"
                    style={{
                      fontSize: "20px",
                      fontWeight: 500,
                      color: "var(--text-3)",
                      textDecoration: "none",
                      letterSpacing: "-0.015em",
                      transition: "color 0.16s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-2)" }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-3)" }}
                  >
                    Notes
                  </Link>
                  <span style={{ fontSize: "16px", color: "var(--text-3)" }}>/</span>
                  <span
                    style={{
                      fontSize: "20px",
                      fontWeight: 500,
                      color: "var(--accent)",
                      letterSpacing: "-0.015em",
                    }}
                  >
                    {activeSpaceName ? `@${activeSpaceName}` : "Space"}
                  </span>
                </div>
              ) : (
                <h1
                  style={{
                    fontSize: "20px",
                    fontWeight: 500,
                    color: "var(--text-1)",
                    margin: 0,
                    letterSpacing: "-0.015em",
                  }}
                >
                  Notes
                </h1>
              )}
            </div>

            {/* Right controls: group + search + new note */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
              {/* Group by Entity toggle */}
              <button
                onClick={toggleGroupMode}
                title={groupByEntity ? "Ungroup notes" : "Group by entity"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "7px 14px",
                  background: groupByEntity ? "var(--accent-dim)" : "transparent",
                  border: groupByEntity
                    ? "1px solid var(--border-accent)"
                    : "1px solid var(--border)",
                  borderRadius: "8px",
                  cursor: "pointer",
                  color: groupByEntity ? "var(--accent)" : "var(--text-2)",
                  fontSize: "14px",
                  transition: "color 0.16s, border-color 0.16s, background 0.16s",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  if (!groupByEntity) {
                    e.currentTarget.style.color = "var(--text-1)"
                    e.currentTarget.style.borderColor = "var(--border-hover)"
                    e.currentTarget.style.background = "var(--bg-surface)"
                  }
                }}
                onMouseLeave={(e) => {
                  if (!groupByEntity) {
                    e.currentTarget.style.color = "var(--text-2)"
                    e.currentTarget.style.borderColor = "var(--border)"
                    e.currentTarget.style.background = "transparent"
                  }
                }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="1" width="6" height="6" rx="1" />
                  <rect x="9" y="1" width="6" height="6" rx="1" />
                  <rect x="1" y="9" width="6" height="6" rx="1" />
                  <rect x="9" y="9" width="6" height="6" rx="1" />
                </svg>
                Group
              </button>

              {/* Search */}
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-3)",
                    fontSize: "14px",
                    pointerEvents: "none",
                    lineHeight: 1,
                  }}
                >
                  ⌕
                </span>
                <input
                  type="text"
                  placeholder="Search…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: "200px",
                    background: "transparent",
                    border: "1px solid transparent",
                    borderRadius: "8px",
                    padding: "7px 12px 7px 30px",
                    fontSize: "14px",
                    color: "var(--text-1)",
                    outline: "none",
                    transition: "border-color 0.16s, background 0.16s",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)"
                    e.currentTarget.style.background = "var(--bg-surface)"
                  }}
                  onBlur={(e) => {
                    if (!e.currentTarget.value) {
                      e.currentTarget.style.borderColor = "transparent"
                      e.currentTarget.style.background = "transparent"
                    }
                  }}
                />
              </div>

              {/* New note button */}
              <button
                onClick={() => {
                  if (showComposer) {
                    composerTopRef.current?.querySelector("textarea")?.focus()
                    return
                  }
                  setShowComposer(true)
                }}
                title="New note"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "7px 14px",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  cursor: "pointer",
                  color: "var(--text-2)",
                  fontSize: "14px",
                  transition: "color 0.16s, border-color 0.16s, background 0.16s",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text-1)"
                  e.currentTarget.style.borderColor = "var(--border-hover)"
                  e.currentTarget.style.background = "var(--bg-surface)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-2)"
                  e.currentTarget.style.borderColor = "var(--border)"
                  e.currentTarget.style.background = "transparent"
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New
              </button>
            </div>
          </div>

          {/* Entity Tags Row */}
          {showEntityTags && (
            <div style={{ position: "relative", marginBottom: "16px" }}>
              <div className="entity-tags-scroll" style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "2px" }}>
                <EntityTag
                  label="All"
                  count={notes.length}
                  active={activeEntityId === null}
                  onClick={() => setEntityFilter(null)}
                />
                {entityStats.map(({ entity, count }) => (
                  <EntityTag
                    key={entity.id}
                    label={entity.name}
                    count={count}
                    active={activeEntityId === entity.id}
                    onClick={() => setEntityFilter(activeEntityId === entity.id ? null : entity.id)}
                  />
                ))}
              </div>
              {/* Right fade mask */}
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  bottom: "2px",
                  width: "48px",
                  background: "linear-gradient(to right, transparent, var(--bg-base))",
                  pointerEvents: "none",
                }}
              />
            </div>
          )}

          {/* Divider line */}
          <div style={{ height: "1px", background: "var(--border-subtle)" }} />
        </div>

        {/* Cards scroll area */}
        <div
          ref={scrollContainerRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 32px 32px",
          }}
        >
          <div style={{ maxWidth: "680px" }}>
            {showComposer && (
              <div
                ref={composerTopRef}
                style={{
                  padding: "24px 0 0",
                  animation: "scaleIn 160ms ease-in-out both",
                }}
              >
                <NoteComposer
                  mode="create"
                  onSave={(note) => {
                    justAddedId.current = note.id
                    setShowComposer(false)
                    setNotes((prev) => [note, ...prev])
                    setSelectedNote(note)
                  }}
                  onCancel={() => setShowComposer(false)}
                />
              </div>
            )}
            {renderMain()}
          </div>
        </div>
      </div>

      {/* Detail panel (fixed right) */}
      {selectedNote && (
        <div
          ref={detailRef}
          className="panel-slide-in"
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: DETAIL_W,
            background: "var(--bg-elevated)",
            borderLeft: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            zIndex: 40,
          }}
        >
          {/* Panel header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 24px",
              borderBottom: "1px solid var(--border)",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: "12px", color: "var(--text-3)" }}>
              {relativeTime(selectedNote.created_at)}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  fontSize: "13px",
                  color: confirmDelete ? "#DC2626" : "var(--text-3)",
                  background: "transparent",
                  padding: "5px 8px",
                  borderRadius: "7px",
                  border: `1px solid ${confirmDelete ? "rgba(220,38,38,0.25)" : "transparent"}`,
                  cursor: deleting ? "not-allowed" : "pointer",
                  transition: "color 0.16s, border-color 0.16s",
                  opacity: deleting ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!confirmDelete) e.currentTarget.style.color = "#DC2626"
                }}
                onMouseLeave={(e) => {
                  if (!confirmDelete) e.currentTarget.style.color = "var(--text-3)"
                }}
              >
                {deleting ? "Deleting…" : confirmDelete ? "Delete?" : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => setSelectedNote(null)}
                style={{
                  width: "28px",
                  height: "28px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  border: "1px solid transparent",
                  borderRadius: "7px",
                  cursor: "pointer",
                  color: "var(--text-3)",
                  fontSize: "14px",
                  transition: "background 0.16s, color 0.16s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)"
                  e.currentTarget.style.color = "var(--text-1)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent"
                  e.currentTarget.style.color = "var(--text-3)"
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div style={{ flex: 1, overflowY: "auto" }}>

            {/* ── Section 1: Note writing area ── */}
            <div style={{ padding: "24px 28px" }}>
              <textarea
                value={panelText}
                onChange={(e) => {
                  setPanelText(e.target.value)
                  scheduleSave(e.target.value)
                  // auto-resize
                  e.target.style.height = "auto"
                  e.target.style.height = e.target.scrollHeight + "px"
                }}
                ref={(el) => {
                  if (el) {
                    el.style.height = "auto"
                    el.style.height = el.scrollHeight + "px"
                  }
                }}
                style={{
                  width: "100%",
                  resize: "none",
                  border: "none",
                  outline: "none",
                  fontSize: "16px",
                  lineHeight: 1.75,
                  color: "var(--text-1)",
                  background: "transparent",
                  fontFamily: "inherit",
                  padding: 0,
                  boxSizing: "border-box",
                  minHeight: "120px",
                  overflow: "hidden",
                }}
              />
              <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "10px", height: "14px" }}>
                {panelSaving ? "Saving…" : panelSaved ? "Saved" : ""}
              </div>
            </div>

            {/* ── Section 2: Tasks ── */}
            <div
              style={{
                padding: "20px 28px",
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              {/* Section header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--text-3)",
                  }}
                >
                  Tasks
                </span>
                <Link
                  href="/tasks"
                  style={{
                    fontSize: "12px",
                    color: "var(--accent)",
                    textDecoration: "none",
                    transition: "opacity 0.16s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7" }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1" }}
                >
                  Tasks →
                </Link>
              </div>

              {/* Existing tasks */}
              {noteTasks.filter((t) => t.status !== "done").length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", marginBottom: "12px" }}>
                  {noteTasks
                    .filter((t) => t.status !== "done")
                    .map((task) => (
                      <div
                        key={task.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "7px 0",
                          borderBottom: "1px solid var(--border-subtle)",
                          gap: "8px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                          <span
                            style={{
                              width: "6px",
                              height: "6px",
                              borderRadius: "50%",
                              flexShrink: 0,
                              background:
                                task.status === "doing" ? "#F97316"
                                : task.status === "next" ? "var(--accent)"
                                : "var(--text-3)",
                            }}
                          />
                          <span
                            style={{
                              fontSize: "14px",
                              color: "var(--text-1)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {task.title}
                          </span>
                        </div>
                        {task.due_date && (
                          <span style={{ fontSize: "12px", color: "var(--text-3)", flexShrink: 0 }}>
                            {new Date(task.due_date).toLocaleDateString("en", { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              )}

              {/* Quick-add form */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", gap: "6px" }}>
                  <input
                    type="text"
                    placeholder="Add a task…"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddTask() }}
                    style={{
                      flex: 1,
                      border: "1px solid var(--border)",
                      borderRadius: "7px",
                      padding: "6px 10px",
                      fontSize: "14px",
                      color: "var(--text-1)",
                      background: "var(--bg-surface)",
                      outline: "none",
                      fontFamily: "inherit",
                      transition: "border-color 0.16s",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)" }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)" }}
                  />
                  <input
                    type="date"
                    value={taskDue}
                    onChange={(e) => setTaskDue(e.target.value)}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "7px",
                      padding: "6px 8px",
                      fontSize: "13px",
                      background: "var(--bg-surface)",
                      color: taskDue ? "var(--text-1)" : "var(--text-3)",
                      outline: "none",
                      fontFamily: "inherit",
                      width: "120px",
                      flexShrink: 0,
                    }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={handleAddTask}
                    disabled={!taskTitle.trim() || addingTask}
                    style={{
                      fontSize: "13px",
                      color: taskTitle.trim() ? "var(--accent)" : "var(--text-3)",
                      background: "transparent",
                      border: "1px solid var(--border-accent)",
                      borderRadius: "7px",
                      padding: "5px 12px",
                      cursor: taskTitle.trim() ? "pointer" : "default",
                      transition: "opacity 0.16s",
                      opacity: taskTitle.trim() ? 1 : 0.4,
                    }}
                    onMouseEnter={(e) => { if (taskTitle.trim()) e.currentTarget.style.opacity = "0.7" }}
                    onMouseLeave={(e) => { if (taskTitle.trim()) e.currentTarget.style.opacity = "1" }}
                  >
                    {addingTask ? "Adding…" : "+ Add"}
                  </button>
                </div>
              </div>
            </div>

            {/* ── Section 3: Spaces ── */}
            {selectedNote.spaces && selectedNote.spaces.length > 0 && (
              <div
                style={{
                  padding: "16px 28px 24px",
                  borderTop: "1px solid var(--border-subtle)",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px",
                }}
              >
                {selectedNote.spaces.map((s) => (
                  <Link
                    key={s.id}
                    href={`/notes?space=${s.id}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "2px 9px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: 500,
                      background: SPACE_STYLE.bg,
                      color: SPACE_STYLE.text,
                      border: `1px solid ${SPACE_STYLE.border}`,
                      textDecoration: "none",
                      transition: "opacity 0.16s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7" }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1" }}
                  >
                    @{s.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
