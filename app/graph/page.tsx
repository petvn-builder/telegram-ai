"use client"

import { useEffect, useState, useRef } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import * as d3 from "d3-force"
import { getSupabaseBrowser } from "@/lib/supabase/browser"

const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d"),
  { ssr: false }
)

// ─── types ───────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string
  label?: string
  type: "entity" | "note"
  size: number
  content?: string
  x?: number
  y?: number
}

interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
}

interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

interface NoteEntity {
  id: string
  name: string
  type: string
}

interface NoteDetail {
  id: string
  content: string
  createdAt: string
  relatedEntities: NoteEntity[]
}

type PanelMode =
  | { kind: "idle" }
  | { kind: "note-loading" }
  | { kind: "note"; note: NoteDetail }
  | { kind: "entity"; entityId: string; entityLabel: string; notes: GraphNode[] }

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

const ENTITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  person:   { bg: "rgba(59,130,246,0.12)",  text: "#60a5fa", border: "rgba(59,130,246,0.25)"  },
  project:  { bg: "rgba(139,92,246,0.12)",  text: "#a78bfa", border: "rgba(139,92,246,0.25)"  },
  company:  { bg: "rgba(245,158,11,0.12)",  text: "#fbbf24", border: "rgba(245,158,11,0.25)"  },
  tool:     { bg: "rgba(16,185,129,0.12)",  text: "#34d399", border: "rgba(16,185,129,0.25)"  },
  topic:    { bg: "rgba(99,102,241,0.12)",  text: "#818cf8", border: "rgba(99,102,241,0.25)"  },
  goal:     { bg: "rgba(236,72,153,0.12)",  text: "#f472b6", border: "rgba(236,72,153,0.25)"  },
  event:    { bg: "rgba(249,115,22,0.12)",  text: "#fb923c", border: "rgba(249,115,22,0.25)"  },
  resource: { bg: "rgba(20,184,166,0.12)",  text: "#2dd4bf", border: "rgba(20,184,166,0.25)"  },
}

function entityStyle(type: string) {
  return ENTITY_COLORS[type] ?? { bg: "rgba(255,255,255,0.06)", text: "#9090a8", border: "rgba(255,255,255,0.12)" }
}

// ─── small components ────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 0",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
    }}>
      <span style={{ fontSize: "12px", color: "#9090a8" }}>{label}</span>
      <span style={{ fontSize: "13px", fontWeight: 600, color: "#e8e8f0" }}>{value}</span>
    </div>
  )
}

function LinkedNoteCard({ note, onFocus }: { note: GraphNode; onFocus: () => void }) {
  const [hovered, setHovered] = useState(false)
  const content = note.content ?? ""
  return (
    <button
      onClick={onFocus}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        textAlign: "left",
        background: hovered ? "#1f1f30" : "#1a1a26",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "10px",
        padding: "12px 14px",
        cursor: "pointer",
        transition: "background 0.15s",
        fontSize: "12px",
        lineHeight: 1.6,
        color: "#c8c8d8",
      }}
    >
      {content.length > 120 ? content.slice(0, 120).trimEnd() + "…" : content || "—"}
    </button>
  )
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function GraphPage() {
  const [data, setData] = useState<GraphData | null>(null)
  const [panel, setPanel] = useState<PanelMode>({ kind: "idle" })
  const [hoveredNote, setHoveredNote] = useState<GraphNode | null>(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })
  const fgRef = useRef<any>(null)

  // Track cursor globally
  useEffect(() => {
    const onMove = (e: MouseEvent) => setHoverPos({ x: e.clientX, y: e.clientY })
    window.addEventListener("mousemove", onMove)
    return () => window.removeEventListener("mousemove", onMove)
  }, [])

  // Fetch graph
  useEffect(() => {
    getSupabaseBrowser().auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      fetch("/api/graph")
        .then((r) => r.json())
        .then((d: GraphData) => setData(d))
        .catch((err) => console.error("Graph fetch failed:", err))
    })
  }, [])

  // Configure physics + auto-zoom
  useEffect(() => {
    if (!data || !fgRef.current) return
    const fg = fgRef.current
    fg.d3Force("charge")?.strength(-400)
    fg.d3Force("link")?.distance(160)
    fg.d3Force(
      "collision",
      d3.forceCollide((node: any) => Math.sqrt(node.size || 1) * 10)
    )
    setTimeout(() => fg.zoomToFit(400, 80), 300)
  }, [data])

  // Hover
  async function handleNodeHover(node: any) {
    if (!node || node.type !== "note") {
      setHoveredNote(null)
      return
    }
    if (node.content) {
      setHoveredNote(node as GraphNode)
      return
    }
    try {
      const res = await fetch(`/api/note?id=${node.id}`)
      if (!res.ok) return
      const d = await res.json()
      node.content = d.content
      setHoveredNote({ ...node } as GraphNode)
    } catch {}
  }

  // Click
  async function handleNodeClick(node: any) {
    if (node.type === "note") {
      setPanel({ kind: "note-loading" })
      try {
        const res = await fetch(`/api/note?id=${node.id}`)
        if (!res.ok) throw new Error()
        const d: NoteDetail = await res.json()
        setPanel({ kind: "note", note: d })
      } catch {
        setPanel({ kind: "idle" })
      }
    } else if (node.type === "entity" && data) {
      // Collect linked notes from graph link data
      const linkedNoteIds = new Set<string>()
      for (const link of data.links) {
        const src = typeof link.source === "object" ? link.source.id : link.source
        const tgt = typeof link.target === "object" ? link.target.id : link.target
        if (src === node.id) linkedNoteIds.add(tgt)
        if (tgt === node.id) linkedNoteIds.add(src)
      }
      const linkedNotes = data.nodes.filter(
        (n) => n.type === "note" && linkedNoteIds.has(n.id)
      )
      setPanel({
        kind: "entity",
        entityId: node.id,
        entityLabel: node.label || node.id,
        notes: linkedNotes,
      })
      if (fgRef.current && node.x != null) {
        fgRef.current.centerAt(node.x, node.y, 800)
        fgRef.current.zoom(2.5, 800)
      }
    }
  }

  // Loading screen
  if (!data) {
    return (
      <div style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0d0d14",
        flexDirection: "column",
        gap: "12px",
      }}>
        <div style={{
          width: "32px",
          height: "32px",
          border: "2px solid rgba(99,102,241,0.20)",
          borderTop: "2px solid #6366f1",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <p style={{ fontSize: "13px", color: "#505068", margin: 0 }}>Loading graph…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{
      height: "100vh",
      display: "grid",
      gridTemplateColumns: "1fr 400px",
      background: "#0d0d14",
      position: "relative",
    }}>

      {/* ── GRAPH CANVAS ── */}
      <div style={{ overflow: "hidden", position: "relative" }}>
        {/* View All Notes pill */}
        <div style={{ position: "absolute", top: "16px", left: "16px", zIndex: 10 }}>
          <Link
            href="/notes"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 12px",
              fontSize: "12px",
              fontWeight: 500,
              color: "#9090a8",
              background: "rgba(18,18,26,0.85)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "8px",
              textDecoration: "none",
              backdropFilter: "blur(12px)",
              transition: "color 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#e8e8f0"
              ;(e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.16)"
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#9090a8"
              ;(e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)"
            }}
          >
            ☰ All Notes
          </Link>
        </div>

        <ForceGraph2D
          ref={fgRef}
          graphData={data}
          nodeAutoColorBy="type"
          backgroundColor="#0d0d14"
          nodeVal={(node: any) => Math.sqrt(node.size || 1)}
          nodeRelSize={4}
          linkWidth={(link: any) => (link.weight || 1) * 0.5}
          linkColor={() => "rgba(255,255,255,0.06)"}
          linkDirectionalParticles={2}
          linkDirectionalParticleSpeed={0.004}
          linkDirectionalParticleColor={() => "rgba(99,102,241,0.5)"}
          cooldownTicks={100}
          d3VelocityDecay={0.3}
          nodeCanvasObjectMode={() => "after"}
          nodeCanvasObject={(node: any, ctx, globalScale) => {
            if (node.type !== "entity") return
            const label = node.label || node.id
            const fontSize = Math.max(11, 14 / globalScale)
            ctx.font = `500 ${fontSize}px -apple-system, sans-serif`
            ctx.fillStyle = "#c8c8d8"
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillText(label, node.x, node.y + Math.sqrt(node.size || 1) * 5 + fontSize)
          }}
          onNodeHover={handleNodeHover}
          onNodeClick={handleNodeClick}
        />
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{
        background: "#12121a",
        borderLeft: "1px solid rgba(255,255,255,0.07)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Panel header */}
        <div style={{
          padding: "20px 24px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}>
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "#e8e8f0", margin: 0 }}>
            {panel.kind === "entity"
              ? panel.entityLabel
              : panel.kind === "note" || panel.kind === "note-loading"
              ? "Note"
              : "Knowledge Graph"}
          </h2>
          {panel.kind === "idle" && (
            <p style={{ fontSize: "12px", color: "#505068", margin: "6px 0 0" }}>
              Click any node to explore
            </p>
          )}
        </div>

        {/* Panel body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

          {panel.kind === "idle" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
              <Stat label="Nodes" value={data.nodes.length} />
              <Stat label="Entities" value={data.nodes.filter((n) => n.type === "entity").length} />
              <Stat label="Notes" value={data.nodes.filter((n) => n.type === "note").length} />
              <Stat label="Connections" value={data.links.length} />
            </div>
          )}

          {panel.kind === "note-loading" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[100, 85, 92, 70].map((w, i) => (
                <div key={i} className="skeleton" style={{ height: "13px", borderRadius: "6px", width: `${w}%` }} />
              ))}
            </div>
          )}

          {panel.kind === "note" && (
            <>
              <p style={{ fontSize: "11px", color: "#505068", margin: "0 0 16px" }}>
                {formatDate(panel.note.createdAt)}
              </p>
              <p style={{
                fontSize: "13px",
                lineHeight: 1.75,
                color: "#e8e8f0",
                whiteSpace: "pre-wrap",
                margin: "0 0 24px",
              }}>
                {panel.note.content}
              </p>

              {panel.note.relatedEntities.length > 0 && (
                <>
                  <p style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: "#505068",
                    margin: "0 0 10px",
                  }}>
                    Linked Entities
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {panel.note.relatedEntities.map((entity) => {
                      const s = entityStyle(entity.type)
                      return (
                        <button
                          key={entity.id}
                          onClick={() => {
                            const found = data.nodes.find((n) => n.id === entity.id)
                            if (found && fgRef.current) {
                              fgRef.current.centerAt(found.x, found.y, 800)
                              fgRef.current.zoom(3, 800)
                            }
                          }}
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
                            cursor: "pointer",
                            transition: "filter 0.15s",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.2)" }}
                          onMouseLeave={(e) => { e.currentTarget.style.filter = "none" }}
                        >
                          {entity.name}
                          <span style={{ opacity: 0.55, fontSize: "10px" }}>{entity.type}</span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </>
          )}

          {panel.kind === "entity" && (
            <>
              {panel.notes.length === 0 ? (
                <p style={{ fontSize: "13px", color: "#505068" }}>
                  No notes linked to this entity.
                </p>
              ) : (
                <>
                  <p style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: "#505068",
                    margin: "0 0 12px",
                  }}>
                    {panel.notes.length} Linked Note{panel.notes.length !== 1 ? "s" : ""}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {panel.notes.map((note) => (
                      <LinkedNoteCard
                        key={note.id}
                        note={note}
                        onFocus={() => {
                          if (fgRef.current && note.x != null) {
                            fgRef.current.centerAt(note.x, note.y, 600)
                            fgRef.current.zoom(3, 600)
                          }
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Panel footer */}
        {(panel.kind === "note" || panel.kind === "entity") && (
          <div style={{
            padding: "12px 24px",
            borderTop: "1px solid rgba(255,255,255,0.07)",
            flexShrink: 0,
          }}>
            <button
              onClick={() => setPanel({ kind: "idle" })}
              style={{
                fontSize: "12px",
                color: "#505068",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
                transition: "color 0.12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#9090a8" }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#505068" }}
            >
              ← Back
            </button>
          </div>
        )}
      </div>

      {/* ── HOVER POPUP ── */}
      {hoveredNote && (
        <div style={{
          position: "fixed",
          top: hoverPos.y + 16,
          left: hoverPos.x + 16,
          background: "#1a1a26",
          padding: "12px 16px",
          borderRadius: "10px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
          maxWidth: "320px",
          fontSize: "13px",
          lineHeight: 1.6,
          zIndex: 1000,
          pointerEvents: "none",
          whiteSpace: "pre-wrap",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "#e8e8f0",
        }}>
          {hoveredNote.content
            ? hoveredNote.content.slice(0, 160) + (hoveredNote.content.length > 160 ? "…" : "")
            : "Loading…"}
        </div>
      )}
    </div>
  )
}
