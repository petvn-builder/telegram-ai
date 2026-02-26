"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import type { Entity, NoteWithEntities } from "./types"

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function preview(content: string, len = 140) {
  return content.length > len ? content.slice(0, len).trimEnd() + "…" : content
}

const ENTITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  person:   { bg: "rgba(59,130,246,0.14)",  text: "#60a5fa", border: "rgba(59,130,246,0.28)"  },
  project:  { bg: "rgba(139,92,246,0.14)",  text: "#a78bfa", border: "rgba(139,92,246,0.28)"  },
  company:  { bg: "rgba(245,158,11,0.14)",  text: "#fbbf24", border: "rgba(245,158,11,0.28)"  },
  tool:     { bg: "rgba(16,185,129,0.14)",  text: "#34d399", border: "rgba(16,185,129,0.28)"  },
  topic:    { bg: "rgba(99,102,241,0.14)",  text: "#818cf8", border: "rgba(99,102,241,0.28)"  },
  goal:     { bg: "rgba(236,72,153,0.14)",  text: "#f472b6", border: "rgba(236,72,153,0.28)"  },
  event:    { bg: "rgba(249,115,22,0.14)",  text: "#fb923c", border: "rgba(249,115,22,0.28)"  },
  resource: { bg: "rgba(20,184,166,0.14)",  text: "#2dd4bf", border: "rgba(20,184,166,0.28)"  },
}

function entityStyle(type: string) {
  return ENTITY_COLORS[type] ?? { bg: "rgba(255,255,255,0.09)", text: "var(--text-2)", border: "rgba(255,255,255,0.16)" }
}

// ─── sub-components ──────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "12px",
      padding: "18px",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
    }}>
      <div className="skeleton" style={{ height: "12px", borderRadius: "6px", width: "90%" }} />
      <div className="skeleton" style={{ height: "12px", borderRadius: "6px", width: "75%" }} />
      <div className="skeleton" style={{ height: "12px", borderRadius: "6px", width: "55%" }} />
      <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
        <div className="skeleton" style={{ height: "20px", borderRadius: "999px", width: "60px" }} />
        <div className="skeleton" style={{ height: "20px", borderRadius: "999px", width: "80px" }} />
      </div>
    </div>
  )
}

function EntityBadge({ entity }: { entity: Entity }) {
  const s = entityStyle(entity.type)
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      padding: "2px 8px",
      borderRadius: "999px",
      fontSize: "11px",
      fontWeight: 500,
      background: s.bg,
      color: s.text,
      border: `1px solid ${s.border}`,
      whiteSpace: "nowrap",
    }}>
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
          ? "rgba(99,102,241,0.12)"
          : hovered
          ? "var(--bg-card-hover)"
          : "var(--bg-card)",
        border: selected
          ? "1px solid rgba(99,102,241,0.35)"
          : "1px solid var(--border)",
        borderLeft: selected ? "4px solid var(--accent)" : "1px solid var(--border)",
        borderRadius: "12px",
        padding: "18px",
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <p style={{
        fontSize: "13px",
        lineHeight: 1.6,
        color: "var(--text-1)",
        margin: 0,
      }}>
        {preview(note.content)}
      </p>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <p style={{ fontSize: "11px", color: "var(--text-2)", margin: 0, flexShrink: 0 }}>
          {formatDate(note.created_at)}
        </p>

        {note.entities.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", justifyContent: "flex-end" }}>
            {note.entities.slice(0, 3).map((e) => (
              <EntityBadge key={e.id} entity={e} />
            ))}
            {note.entities.length > 3 && (
              <span style={{ fontSize: "11px", color: "var(--text-3)", padding: "2px 4px" }}>
                +{note.entities.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  )
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function NotesPage() {
  const [notes, setNotes] = useState<NoteWithEntities[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNote, setSelectedNote] = useState<NoteWithEntities | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set())
  const [groupByEntity, setGroupByEntity] = useState(false)
  const detailRef = useRef<HTMLDivElement>(null)

  // Fetch
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

  // Derive unique entities with counts
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

  // Filtered notes
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

  // Grouped notes
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

  // Re-trigger animation when selected note changes
  useEffect(() => {
    if (selectedNote && detailRef.current) {
      detailRef.current.classList.remove("panel-slide-in")
      void detailRef.current.offsetWidth // reflow
      detailRef.current.classList.add("panel-slide-in")
    }
  }, [selectedNote?.id])

  // ── render helpers ────────────────────────────────────────────────────────

  function renderCards(items: NoteWithEntities[]) {
    return items.map((note) => (
      <NoteCard
        key={note.id}
        note={note}
        selected={selectedNote?.id === note.id}
        onClick={() => handleNoteClick(note)}
      />
    ))
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
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "200px",
          color: "#f87171",
          fontSize: "13px",
        }}>
          {error}
        </div>
      )
    }

    if (filteredNotes.length === 0) {
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "300px",
          gap: "8px",
          color: "var(--text-3)",
        }}>
          <span style={{ fontSize: "32px" }}>◌</span>
          <p style={{ fontSize: "13px", margin: 0 }}>
            {searchQuery || selectedEntityIds.size > 0
              ? "No notes match your filter"
              : "No notes saved yet"}
          </p>
          {!searchQuery && selectedEntityIds.size === 0 && (
            <p style={{ fontSize: "12px", margin: 0, color: "var(--text-3)" }}>
              Use <code style={{ fontFamily: "var(--font-geist-mono)", background: "var(--bg-card)", padding: "1px 5px", borderRadius: "4px" }}>/save</code> in Telegram
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
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "10px",
                }}>
                  <span style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: s.text,
                  }}>
                    {entity.name}
                  </span>
                  <span style={{
                    fontSize: "11px",
                    color: "var(--text-2)",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "999px",
                    padding: "0 6px",
                    lineHeight: "18px",
                  }}>
                    {groupNotes.length}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {renderCards(groupNotes)}
                </div>
              </div>
            )
          })}
          {groupedNotes.ungrouped.length > 0 && (
            <div>
              <div style={{ marginBottom: "10px" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)" }}>
                  Unlinked
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {renderCards(groupedNotes.ungrouped)}
              </div>
            </div>
          )}
        </div>
      )
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {renderCards(filteredNotes)}
      </div>
    )
  }

  // ── layout ────────────────────────────────────────────────────────────────

  const SIDEBAR_W = 240
  const DETAIL_W = 380

  return (
    <div style={{
      display: "flex",
      height: "calc(100vh - 52px)",
      background: "var(--bg-base)",
      overflow: "hidden",
      position: "relative",
    }}>
      {/* ── LEFT SIDEBAR ── */}
      <aside style={{
        width: SIDEBAR_W,
        minWidth: SIDEBAR_W,
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid var(--border)" }}>
          <h1 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-1)", margin: "0 0 12px", letterSpacing: "-0.01em" }}>
            Notes
          </h1>

          {/* Search */}
          <div style={{ position: "relative" }}>
            <span style={{
              position: "absolute",
              left: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-3)",
              fontSize: "12px",
              pointerEvents: "none",
            }}>
              ⌕
            </span>
            <input
              type="text"
              placeholder="Search notes…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "7px 10px 7px 28px",
                fontSize: "12px",
                color: "var(--text-1)",
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(99,102,241,0.40)" }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)" }}
            />
          </div>
        </div>

        {/* Entity filter */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 8px" }}>
          {allEntities.length > 0 && (
            <>
              <p style={{
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text-2)",
                margin: "0 8px 8px",
              }}>
                Entities
              </p>

              {allEntities.map(({ entity, count }) => {
                const active = selectedEntityIds.has(entity.id)
                const s = entityStyle(entity.type)
                return (
                  <button
                    key={entity.id}
                    onClick={() => toggleEntity(entity.id)}
                    onMouseEnter={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = "rgba(255,255,255,0.04)"
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = "transparent"
                      }
                    }}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 8px",
                      borderRadius: "7px",
                      border: "none",
                      background: active ? s.bg : "transparent",
                      cursor: "pointer",
                      transition: "background 0.12s",
                      gap: "6px",
                      textAlign: "left",
                    }}
                  >
                    <span style={{
                      display: "flex",
                      flexDirection: "column",
                      minWidth: 0,
                    }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                        <span style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          background: active ? s.text : "var(--text-3)",
                          flexShrink: 0,
                          transition: "background 0.12s",
                        }} />
                        <span style={{
                          fontSize: "12px",
                          color: active ? s.text : "var(--text-2)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontWeight: active ? 500 : 400,
                        }}>
                          {entity.name}
                        </span>
                      </span>
                      <span style={{
                        fontSize: "10px",
                        color: "var(--text-3)",
                        paddingLeft: "13px",
                        lineHeight: "1.4",
                      }}>
                        {entity.type}
                      </span>
                    </span>
                    <span style={{
                      fontSize: "10px",
                      color: "var(--text-2)",
                      flexShrink: 0,
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: "999px",
                      padding: "0 5px",
                      lineHeight: "16px",
                    }}>
                      {count}
                    </span>
                  </button>
                )
              })}

              {selectedEntityIds.size > 0 && (
                <button
                  onClick={() => setSelectedEntityIds(new Set())}
                  style={{
                    marginTop: "8px",
                    width: "100%",
                    padding: "5px 8px",
                    fontSize: "11px",
                    color: "var(--text-3)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    borderRadius: "6px",
                    transition: "color 0.12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-2)" }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)" }}
                >
                  ✕ Clear filter
                </button>
              )}
            </>
          )}
        </div>

        {/* Group toggle */}
        <div style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span style={{ fontSize: "13px", color: "var(--text-2)" }}>Group by entity</span>
          <button
            onClick={() => setGroupByEntity((v) => !v)}
            style={{
              width: "34px",
              height: "18px",
              borderRadius: "999px",
              border: "none",
              background: groupByEntity ? "#6366f1" : "var(--bg-card-hover)",
              cursor: "pointer",
              position: "relative",
              transition: "background 0.2s",
              flexShrink: 0,
            }}
          >
            <span style={{
              position: "absolute",
              top: "2px",
              left: groupByEntity ? "16px" : "2px",
              width: "14px",
              height: "14px",
              borderRadius: "50%",
              background: "white",
              transition: "left 0.2s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
            }} />
          </button>
        </div>
      </aside>

      {/* ── MAIN PANEL ── */}
      <main style={{
        flex: 1,
        overflowY: "auto",
        padding: "24px",
        transition: "padding-right 0.25s",
        paddingRight: selectedNote ? `${DETAIL_W + 24}px` : "24px",
      }}>
        {/* Stats bar */}
        {!loading && notes.length > 0 && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "16px",
          }}>
            <span style={{ fontSize: "12px", color: "var(--text-2)" }}>
              {filteredNotes.length === notes.length
                ? `${notes.length} notes`
                : `${filteredNotes.length} of ${notes.length} notes`}
            </span>
          </div>
        )}

        {renderMain()}
      </main>

      {/* ── DETAIL PANEL (fixed right) ── */}
      {selectedNote && (
        <div
          ref={detailRef}
          className="panel-slide-in"
          style={{
            position: "fixed",
            top: "52px",
            right: 0,
            bottom: 0,
            width: DETAIL_W,
            background: "var(--bg-elevated)",
            borderLeft: "1px solid var(--border)",
            boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.4)",
            display: "flex",
            flexDirection: "column",
            zIndex: 40,
          }}
        >
          {/* Panel header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}>
            <span style={{ fontSize: "12px", color: "var(--text-2)" }}>
              {formatDate(selectedNote.created_at)}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Link
                href={`/notes/${selectedNote.id}`}
                style={{
                  fontSize: "11px",
                  color: "var(--text-2)",
                  textDecoration: "none",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  transition: "color 0.12s, border-color 0.12s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "var(--text-1)"
                  ;(e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.15)"
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "var(--text-2)"
                  ;(e.currentTarget as HTMLElement).style.borderColor = "var(--border)"
                }}
              >
                Open ↗
              </Link>
              <button
                onClick={() => setSelectedNote(null)}
                style={{
                  width: "24px",
                  height: "24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  color: "var(--text-2)",
                  fontSize: "14px",
                  transition: "background 0.12s, color 0.12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-card)"
                  e.currentTarget.style.color = "var(--text-1)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent"
                  e.currentTarget.style.color = "var(--text-2)"
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
            <p style={{
              fontSize: "13px",
              lineHeight: 1.75,
              color: "var(--text-1)",
              whiteSpace: "pre-wrap",
              margin: 0,
            }}>
              {selectedNote.content}
            </p>
          </div>

          {/* Entities footer */}
          {selectedNote.entities.length > 0 && (
            <div style={{
              padding: "16px 20px",
              borderTop: "1px solid var(--border)",
              flexShrink: 0,
            }}>
              <p style={{
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "var(--text-2)",
                margin: "0 0 10px",
              }}>
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
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(1.15)" }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = "none" }}
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
                  marginTop: "12px",
                  fontSize: "12px",
                  color: "#6366f1",
                  textDecoration: "none",
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.75" }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1" }}
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
