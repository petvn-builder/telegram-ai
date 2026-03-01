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

// Light-appropriate entity colors: subdued backgrounds, readable text
const ENTITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  person:   { bg: "rgba(37,99,235,0.09)",    text: "#1D4ED8", border: "rgba(37,99,235,0.18)" },
  project:  { bg: "rgba(109,40,217,0.09)",   text: "#6D28D9", border: "rgba(109,40,217,0.18)" },
  company:  { bg: "rgba(180,83,9,0.09)",     text: "#B45309", border: "rgba(180,83,9,0.18)" },
  tool:     { bg: "rgba(4,120,87,0.09)",     text: "#047857", border: "rgba(4,120,87,0.18)" },
  topic:    { bg: "rgba(67,56,202,0.09)",    text: "#3730A3", border: "rgba(67,56,202,0.18)" },
  goal:     { bg: "rgba(190,24,93,0.09)",    text: "#BE185D", border: "rgba(190,24,93,0.18)" },
  event:    { bg: "rgba(194,65,12,0.09)",    text: "#C2410C", border: "rgba(194,65,12,0.18)" },
  resource: { bg: "rgba(15,118,110,0.09)",   text: "#0F766E", border: "rgba(15,118,110,0.18)" },
}

const SPACE_STYLE = {
  bg: "var(--accent-dim)",
  text: "var(--accent)",
  border: "var(--border-accent)",
}

function entityStyle(type: string) {
  return (
    ENTITY_COLORS[type] ?? {
      bg: "rgba(107,114,128,0.09)",
      text: "var(--text-2)",
      border: "rgba(107,114,128,0.18)",
    }
  )
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
  const [editMode, setEditMode] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
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
              padding: "20px 28px",
              borderBottom: "1px solid var(--border)",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: "13px", color: "var(--text-3)" }}>
              {relativeTime(selectedNote.created_at)}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {!editMode && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    fontSize: "13px",
                    color: confirmDelete ? "#DC2626" : "var(--text-3)",
                    background: "transparent",
                    padding: "5px 10px",
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
              )}
              {!editMode && (
                <button
                  onClick={() => setEditMode(true)}
                  style={{
                    fontSize: "13px",
                    color: "var(--text-2)",
                    background: "transparent",
                    padding: "5px 10px",
                    borderRadius: "7px",
                    border: "1px solid var(--border)",
                    cursor: "pointer",
                    transition: "color 0.16s, border-color 0.16s",
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
                  fontSize: "13px",
                  color: "var(--text-2)",
                  textDecoration: "none",
                  padding: "5px 10px",
                  borderRadius: "7px",
                  border: "1px solid var(--border)",
                  transition: "color 0.16s, border-color 0.16s",
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

          {/* Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "32px" }}>
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
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "20px" }}>
                    {selectedNote.spaces.map((s) => (
                      <Link
                        key={s.id}
                        href={`/notes?space=${s.id}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "3px 10px",
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
                <p
                  style={{
                    fontSize: "16px",
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
                padding: "20px 28px 24px",
                borderTop: "1px solid var(--border)",
                flexShrink: 0,
              }}
            >
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "var(--text-3)",
                  margin: "0 0 10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Linked
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                {selectedNote.entities.map((entity) => {
                  const s = entityStyle(entity.type)
                  return (
                    <Link
                      key={entity.id}
                      href="/graph"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "3px 9px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: 500,
                        background: s.bg,
                        color: s.text,
                        border: `1px solid ${s.border}`,
                        textDecoration: "none",
                        transition: "opacity 0.16s",
                      }}
                      onMouseEnter={(e) => {
                        ;(e.currentTarget as HTMLElement).style.opacity = "0.75"
                      }}
                      onMouseLeave={(e) => {
                        ;(e.currentTarget as HTMLElement).style.opacity = "1"
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
                  gap: "5px",
                  marginTop: "14px",
                  fontSize: "12px",
                  color: "var(--accent)",
                  textDecoration: "none",
                  transition: "opacity 0.16s",
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
