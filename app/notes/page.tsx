"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import type { Entity, Space, NoteWithEntities } from "./types"
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

const ENTITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  person:   { bg: "rgba(59,130,246,0.14)",  text: "#60a5fa", border: "rgba(59,130,246,0.28)" },
  project:  { bg: "rgba(139,92,246,0.14)",  text: "#a78bfa", border: "rgba(139,92,246,0.28)" },
  company:  { bg: "rgba(245,158,11,0.14)",  text: "#fbbf24", border: "rgba(245,158,11,0.28)" },
  tool:     { bg: "rgba(16,185,129,0.14)",  text: "#34d399", border: "rgba(16,185,129,0.28)" },
  topic:    { bg: "rgba(99,102,241,0.14)",  text: "#818cf8", border: "rgba(99,102,241,0.28)" },
  goal:     { bg: "rgba(236,72,153,0.14)",  text: "#f472b6", border: "rgba(236,72,153,0.28)" },
  event:    { bg: "rgba(249,115,22,0.14)",  text: "#fb923c", border: "rgba(249,115,22,0.28)" },
  resource: { bg: "rgba(20,184,166,0.14)",  text: "#2dd4bf", border: "rgba(20,184,166,0.28)" },
}

const SPACE_STYLE = { bg: "rgba(99,102,241,0.12)", text: "#818cf8", border: "rgba(99,102,241,0.30)" }

function entityStyle(type: string) {
  return (
    ENTITY_COLORS[type] ?? {
      bg: "rgba(255,255,255,0.09)",
      text: "var(--text-2)",
      border: "rgba(255,255,255,0.16)",
    }
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      style={{
        padding: "16px 0",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div className="skeleton" style={{ height: "14px", borderRadius: "6px", width: "70%" }} />
      <div className="skeleton" style={{ height: "12px", borderRadius: "6px", width: "90%" }} />
      <div className="skeleton" style={{ height: "11px", borderRadius: "6px", width: "120px" }} />
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
        background: selected ? "var(--accent-dim)" : hovered ? "var(--bg-surface)" : "transparent",
        borderLeft: selected ? "2px solid var(--accent)" : "2px solid transparent",
        borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
        borderTop: "none",
        borderRight: "none",
        borderRadius: selected ? "0 6px 6px 0" : "0",
        padding: "16px 12px 16px 14px",
        cursor: "pointer",
        transition: "background 0.12s, border-color 0.12s",
        display: "flex",
        flexDirection: "column",
        gap: "5px",
      }}
    >
      {/* Title */}
      <p
        style={{
          fontSize: "14px",
          fontWeight: 500,
          lineHeight: 1.4,
          color: selected ? "var(--text-1)" : hovered ? "var(--text-1)" : "var(--text-1)",
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
            fontSize: "13px",
            lineHeight: 1.5,
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
          gap: "5px",
          marginTop: "2px",
        }}
      >
        {spaceName && (
          <>
            <span style={{ fontSize: "11px", color: "#818cf8", fontWeight: 500 }}>
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
  const [editMode, setEditMode] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [activeSpaceName, setActiveSpaceName] = useState<string | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  const composerTopRef = useRef<HTMLDivElement>(null)
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

  const filteredNotes = useMemo(() => {
    return notes.filter((note) =>
      searchQuery === "" ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [notes, searchQuery])

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
    setEditMode(false)
    setConfirmDelete(false)
    setDeleting(false)
  }, [selectedNote?.id])

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderCards(items: NoteWithEntities[]) {
    return items.map((note, idx) => {
      const isNew = note.id === justAddedId.current
      return (
        <div
          key={note.id}
          style={isNew ? { animation: "fadeInUp 180ms ease-out both" } : undefined}
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
            color: "#f87171",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )
    }

    if (filteredNotes.length === 0) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "300px",
            gap: "10px",
            color: "var(--text-3)",
          }}
        >
          <span style={{ fontSize: "28px" }}>◌</span>
          <p style={{ fontSize: "14px", margin: 0, color: "var(--text-2)" }}>
            {searchQuery
              ? "No notes match your search"
              : activeSpaceId
              ? `No notes in ${activeSpaceName ? `@${activeSpaceName}` : "this space"} yet`
              : "No notes saved yet"}
          </p>
          {!searchQuery && !activeSpaceId && (
            <p style={{ fontSize: "13px", margin: 0, color: "var(--text-3)" }}>
              Use{" "}
              <code
                style={{
                  fontFamily: "var(--font-geist-mono)",
                  background: "var(--bg-surface)",
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
      <div style={{ display: "flex", flexDirection: "column" }}>
        {renderCards(filteredNotes)}
      </div>
    )
  }

  // ── Layout ────────────────────────────────────────────────────────────────

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
          transition: "padding-right 0.25s",
          paddingRight: selectedNote ? `${DETAIL_W}px` : "0",
        }}
      >
        {/* Page header */}
        <div style={{ padding: "28px 28px 0", flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              marginBottom: "20px",
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
                      fontWeight: 600,
                      color: "var(--text-3)",
                      textDecoration: "none",
                      letterSpacing: "-0.015em",
                      transition: "color 0.15s",
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
                      fontWeight: 600,
                      color: SPACE_STYLE.text,
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
                    fontWeight: 600,
                    color: "var(--text-1)",
                    margin: 0,
                    letterSpacing: "-0.015em",
                  }}
                >
                  Notes
                </h1>
              )}
              {!loading && notes.length > 0 && (
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--text-3)",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "999px",
                    padding: "1px 9px",
                    lineHeight: "20px",
                  }}
                >
                  {filteredNotes.length === notes.length
                    ? notes.length
                    : `${filteredNotes.length} / ${notes.length}`}
                </span>
              )}
            </div>

            {/* Right controls: search + new note */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
              {/* Search */}
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: "9px",
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
                    width: "180px",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "7px",
                    padding: "7px 10px 7px 28px",
                    fontSize: "13px",
                    color: "var(--text-1)",
                    outline: "none",
                    transition: "border-color 0.15s",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border-accent)" }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)" }}
                />
              </div>

              {/* New note (+) button */}
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
                  width: "30px",
                  height: "30px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: "7px",
                  cursor: "pointer",
                  color: "var(--text-2)",
                  transition: "color 0.12s, border-color 0.12s, background 0.12s",
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
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Divider line */}
          <div
            style={{
              height: "1px",
              background: "var(--border-subtle)",
              marginBottom: "0",
            }}
          />
        </div>

        {/* Cards scroll area */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 28px 28px",
          }}
        >
          <div style={{ maxWidth: "720px" }}>
            {showComposer && (
              <div
                ref={composerTopRef}
                style={{
                  padding: "20px 0 0",
                  animation: "scaleIn 160ms cubic-bezier(0.16,1,0.3,1) both",
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
            boxShadow: "var(--shadow-lg)",
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
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {!editMode && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    fontSize: "12px",
                    color: confirmDelete ? "#f87171" : "var(--text-3)",
                    background: "transparent",
                    padding: "5px 10px",
                    borderRadius: "7px",
                    border: `1px solid ${confirmDelete ? "rgba(248,113,113,0.35)" : "transparent"}`,
                    cursor: deleting ? "not-allowed" : "pointer",
                    transition: "color 0.12s, border-color 0.12s",
                    opacity: deleting ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!confirmDelete) e.currentTarget.style.color = "#f87171"
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
              )}
              {!editMode && (
                <button
                  onClick={() => setEditMode(true)}
                  style={{
                    fontSize: "12px",
                    color: "var(--text-2)",
                    background: "transparent",
                    padding: "5px 10px",
                    borderRadius: "7px",
                    border: "1px solid var(--border)",
                    cursor: "pointer",
                    transition: "color 0.12s, border-color 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--text-1)"
                    e.currentTarget.style.borderColor = "var(--border-hover)"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--text-2)"
                    e.currentTarget.style.borderColor = "var(--border)"
                  }}
                >
                  Edit
                </button>
              )}
              <Link
                href={`/notes/${selectedNote.id}`}
                style={{
                  fontSize: "12px",
                  color: "var(--text-2)",
                  textDecoration: "none",
                  padding: "5px 10px",
                  borderRadius: "7px",
                  border: "1px solid var(--border)",
                  transition: "color 0.12s, border-color 0.12s",
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLElement).style.color = "var(--text-1)"
                  ;(e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)"
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLElement).style.color = "var(--text-2)"
                  ;(e.currentTarget as HTMLElement).style.borderColor = "var(--border)"
                }}
              >
                Open ↗
              </Link>
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
                  color: "var(--text-2)",
                  fontSize: "14px",
                  transition: "background 0.12s, color 0.12s, border-color 0.12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)"
                  e.currentTarget.style.color = "var(--text-1)"
                  e.currentTarget.style.borderColor = "var(--border)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent"
                  e.currentTarget.style.color = "var(--text-2)"
                  e.currentTarget.style.borderColor = "transparent"
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
            {editMode ? (
              <NoteComposer
                mode="edit"
                noteId={selectedNote.id}
                initialValue={selectedNote.content}
                initialEntities={selectedNote.entities}
                initialSpaces={selectedNote.spaces}
                onSave={(updated) => {
                  setEditMode(false)
                  setNotes((prev) => prev.map((n) => n.id === updated.id ? updated : n))
                  setSelectedNote(updated)
                }}
                onCancel={() => setEditMode(false)}
              />
            ) : (
              <>
                {/* Space badges in detail view */}
                {selectedNote.spaces && selectedNote.spaces.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "16px" }}>
                    {selectedNote.spaces.map((s) => (
                      <Link
                        key={s.id}
                        href={`/notes?space=${s.id}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "2px 8px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 500,
                          background: SPACE_STYLE.bg,
                          color: SPACE_STYLE.text,
                          border: `1px solid ${SPACE_STYLE.border}`,
                          textDecoration: "none",
                          transition: "filter 0.15s",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(1.2)" }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = "none" }}
                      >
                        @{s.name}
                      </Link>
                    ))}
                  </div>
                )}
                <p
                  style={{
                    fontSize: "15px",
                    lineHeight: 1.75,
                    color: "var(--text-1)",
                    whiteSpace: "pre-wrap",
                    margin: 0,
                  }}
                >
                  {selectedNote.content}
                </p>
              </>
            )}
          </div>

          {/* Entities footer */}
          {!editMode && selectedNote.entities.length > 0 && (
            <div
              style={{
                padding: "16px 24px 20px",
                borderTop: "1px solid var(--border)",
                flexShrink: 0,
              }}
            >
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                  margin: "0 0 10px",
                }}
              >
                Linked
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {selectedNote.entities.map((entity) => {
                  const s = entityStyle(entity.type)
                  return (
                    <Link
                      key={entity.id}
                      href="/graph"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        padding: "3px 9px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: 500,
                        background: s.bg,
                        color: s.text,
                        border: `1px solid ${s.border}`,
                        textDecoration: "none",
                        transition: "filter 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        ;(e.currentTarget as HTMLElement).style.filter = "brightness(1.15)"
                      }}
                      onMouseLeave={(e) => {
                        ;(e.currentTarget as HTMLElement).style.filter = "none"
                      }}
                      title={`View ${entity.name} in graph`}
                    >
                      {entity.name}
                      <span style={{ opacity: 0.5, fontSize: "10px" }}>{entity.type}</span>
                    </Link>
                  )
                })}
              </div>

              <Link
                href="/graph"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  marginTop: "14px",
                  fontSize: "12px",
                  color: "var(--accent)",
                  textDecoration: "none",
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLElement).style.opacity = "0.7"
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLElement).style.opacity = "1"
                }}
              >
                View in Graph →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
