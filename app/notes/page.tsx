"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import type { Entity, NoteWithEntities } from "./types"
import NoteComposer from "./NoteComposer"

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function preview(content: string, len = 160) {
  return content.length > len ? content.slice(0, len).trimEnd() + "…" : content
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
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <div style={{ display: "flex", gap: "6px" }}>
        <div className="skeleton" style={{ height: "20px", borderRadius: "999px", width: "64px" }} />
        <div className="skeleton" style={{ height: "20px", borderRadius: "999px", width: "80px" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
        <div className="skeleton" style={{ height: "13px", borderRadius: "6px", width: "95%" }} />
        <div className="skeleton" style={{ height: "13px", borderRadius: "6px", width: "80%" }} />
        <div className="skeleton" style={{ height: "13px", borderRadius: "6px", width: "65%" }} />
      </div>
      <div className="skeleton" style={{ height: "12px", borderRadius: "6px", width: "90px" }} />
    </div>
  )
}

function EntityBadge({ entity }: { entity: Entity }) {
  const s = entityStyle(entity.type)
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "3px 9px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 500,
        background: s.bg,
        color: s.text,
        border: `1px solid ${s.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {entity.name}
    </span>
  )
}

interface NoteCardProps {
  note: NoteWithEntities
  selected: boolean
  onClick: () => void
}

function NoteCard({ note, selected, onClick }: NoteCardProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="card-lift"
      style={{
        width: "100%",
        textAlign: "left",
        background: selected
          ? "var(--accent-dim)"
          : hovered
          ? "var(--bg-hover)"
          : "var(--bg-surface)",
        border: selected
          ? "1px solid var(--border-accent)"
          : "1px solid var(--border)",
        borderLeft: selected
          ? "2px solid var(--accent)"
          : hovered
          ? "2px solid var(--border-hover)"
          : "2px solid transparent",
        borderRadius: "12px",
        padding: "20px",
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      {/* Entity badges — TOP */}
      {note.entities.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
          {note.entities.slice(0, 4).map((e) => (
            <EntityBadge key={e.id} entity={e} />
          ))}
          {note.entities.length > 4 && (
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-3)",
                padding: "3px 6px",
                alignSelf: "center",
              }}
            >
              +{note.entities.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Preview text */}
      <p
        style={{
          fontSize: "14px",
          lineHeight: 1.65,
          color: "var(--text-1)",
          margin: 0,
        }}
      >
        {preview(note.content)}
      </p>

      {/* Footer: date + action */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: "12px", color: "var(--text-2)" }}>
          {formatDate(note.created_at)}
        </span>
        <span
          style={{
            fontSize: "12px",
            color: selected ? "var(--accent)" : "var(--text-3)",
            transition: "color 0.15s",
          }}
        >
          Open ↗
        </span>
      </div>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const DETAIL_W = 400

export default function NotesPage() {
  const [notes, setNotes] = useState<NoteWithEntities[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNote, setSelectedNote] = useState<NoteWithEntities | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set())
  const [groupByEntity, setGroupByEntity] = useState(false)
  const [showComposer, setShowComposer] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const detailRef = useRef<HTMLDivElement>(null)
  const composerTopRef = useRef<HTMLDivElement>(null)
  const justAddedId = useRef<string | null>(null)
  const confirmDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch("/api/notes")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load notes")
        return r.json()
      })
      .then((data: NoteWithEntities[]) => setNotes(data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const allEntities = useMemo(() => {
    const map = new Map<string, { entity: Entity; count: number }>()
    for (const note of notes) {
      for (const entity of note.entities) {
        if (map.has(entity.id)) {
          map.get(entity.id)!.count++
        } else {
          map.set(entity.id, { entity, count: 1 })
        }
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [notes])

  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      const matchesSearch =
        searchQuery === "" ||
        note.content.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesEntity =
        selectedEntityIds.size === 0 ||
        note.entities.some((e) => selectedEntityIds.has(e.id))
      return matchesSearch && matchesEntity
    })
  }, [notes, searchQuery, selectedEntityIds])

  const groupedNotes = useMemo(() => {
    if (!groupByEntity) return null
    const groups = new Map<string, { entity: Entity; notes: NoteWithEntities[] }>()
    const ungrouped: NoteWithEntities[] = []

    for (const note of filteredNotes) {
      if (note.entities.length === 0) {
        ungrouped.push(note)
      } else {
        for (const entity of note.entities) {
          if (!groups.has(entity.id)) {
            groups.set(entity.id, { entity, notes: [] })
          }
          groups.get(entity.id)!.notes.push(note)
        }
      }
    }
    return { groups: [...groups.values()], ungrouped }
  }, [filteredNotes, groupByEntity])

  function toggleEntity(id: string) {
    setSelectedEntityIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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
    setEditMode(false)
    setConfirmDelete(false)
    setDeleting(false)
  }, [selectedNote?.id])

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderCards(items: NoteWithEntities[]) {
    return items.map((note) => {
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
          />
        </div>
      )
    })
  }

  function renderMain() {
    if (loading) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
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
          <span style={{ fontSize: "32px" }}>◌</span>
          <p style={{ fontSize: "14px", margin: 0, color: "var(--text-2)" }}>
            {searchQuery || selectedEntityIds.size > 0
              ? "No notes match your filter"
              : "No notes saved yet"}
          </p>
          {!searchQuery && selectedEntityIds.size === 0 && (
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

    if (groupByEntity && groupedNotes) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          {groupedNotes.groups.map(({ entity, notes: groupNotes }) => {
            const s = entityStyle(entity.type)
            return (
              <div key={entity.id}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "12px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      color: s.text,
                    }}
                  >
                    {entity.name}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--text-2)",
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "999px",
                      padding: "0 7px",
                      lineHeight: "18px",
                    }}
                  >
                    {groupNotes.length}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {renderCards(groupNotes)}
                </div>
              </div>
            )
          })}
          {groupedNotes.ungrouped.length > 0 && (
            <div>
              <div style={{ marginBottom: "12px" }}>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: "var(--text-3)",
                  }}
                >
                  Unlinked
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {renderCards(groupedNotes.ungrouped)}
              </div>
            </div>
          )}
        </div>
      )
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
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
              gap: "16px",
              marginBottom: "20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
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

            {/* New Note button */}
            <button
              onClick={() => {
                if (showComposer) {
                  composerTopRef.current?.querySelector("textarea")?.focus()
                  return
                }
                setShowComposer(true)
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 500,
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                flexShrink: 0,
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88" }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Note
            </button>

            {/* Search */}
            <div style={{ position: "relative", flexShrink: 0 }}>
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
                placeholder="Search notes…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "220px",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "8px 12px 8px 30px",
                  fontSize: "13px",
                  color: "var(--text-1)",
                  outline: "none",
                  transition: "border-color 0.15s, width 0.2s",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-accent)"
                  e.currentTarget.style.width = "260px"
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)"
                  e.currentTarget.style.width = "220px"
                }}
              />
            </div>
          </div>

          {/* Filter chips row */}
          {allEntities.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                overflowX: "auto",
                paddingBottom: "16px",
                scrollbarWidth: "none",
              }}
            >
              {/* All chip */}
              <button
                onClick={() => setSelectedEntityIds(new Set())}
                style={{
                  flexShrink: 0,
                  padding: "5px 13px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  fontWeight: selectedEntityIds.size === 0 ? 600 : 400,
                  color: selectedEntityIds.size === 0 ? "var(--text-1)" : "var(--text-2)",
                  background: selectedEntityIds.size === 0 ? "var(--accent-dim)" : "var(--bg-surface)",
                  border: selectedEntityIds.size === 0
                    ? "1px solid var(--border-accent)"
                    : "1px solid var(--border)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                All
              </button>

              {/* Entity chips */}
              {allEntities.map(({ entity, count }) => {
                const active = selectedEntityIds.has(entity.id)
                const s = entityStyle(entity.type)
                return (
                  <button
                    key={entity.id}
                    onClick={() => toggleEntity(entity.id)}
                    style={{
                      flexShrink: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "5px 11px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: active ? 600 : 400,
                      color: active ? s.text : "var(--text-2)",
                      background: active ? s.bg : "var(--bg-surface)",
                      border: active ? `1px solid ${s.border}` : "1px solid var(--border)",
                      cursor: "pointer",
                      transition: "all 0.15s",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entity.name}
                    <span
                      style={{
                        fontSize: "10px",
                        color: active ? s.text : "var(--text-3)",
                        opacity: 0.75,
                      }}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}

              {/* Divider */}
              <div
                style={{
                  flexShrink: 0,
                  width: "1px",
                  height: "20px",
                  background: "var(--border)",
                  margin: "0 4px",
                }}
              />

              {/* Group toggle */}
              <button
                onClick={() => setGroupByEntity((v) => !v)}
                style={{
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "5px 11px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  fontWeight: groupByEntity ? 600 : 400,
                  color: groupByEntity ? "var(--text-1)" : "var(--text-2)",
                  background: groupByEntity ? "var(--bg-hover)" : "var(--bg-surface)",
                  border: groupByEntity
                    ? "1px solid var(--border-hover)"
                    : "1px solid var(--border)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                Group
              </button>
            </div>
          )}

          {/* Divider line */}
          <div
            style={{
              height: "1px",
              background: "var(--border-subtle)",
              marginBottom: "20px",
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
          <div style={{ maxWidth: "660px" }}>
            {showComposer && (
              <div
                ref={composerTopRef}
                style={{
                  marginBottom: "10px",
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
            <span style={{ fontSize: "12px", color: "var(--text-2)" }}>
              {formatDate(selectedNote.created_at)}
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
                onSave={(updated) => {
                  setEditMode(false)
                  setNotes((prev) => prev.map((n) => n.id === updated.id ? updated : n))
                  setSelectedNote(updated)
                }}
                onCancel={() => setEditMode(false)}
              />
            ) : (
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
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                  margin: "0 0 10px",
                }}
              >
                Linked Entities
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
                        padding: "4px 10px",
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
                      <span style={{ opacity: 0.6, fontSize: "10px" }}>{entity.type}</span>
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
                  ;(e.currentTarget as HTMLElement).style.opacity = "0.75"
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
