"use client"

import { useEffect, useState, useRef, useMemo, useCallback } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import * as d3 from "d3-force"
import { getSupabaseBrowser } from "@/lib/supabase/browser"
import type { Cluster } from "@/lib/graph/buildClusters"
import type { Insight } from "@/app/api/graph/insights/route"

const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d"),
  { ssr: false }
)

// ─── types ───────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string
  label?: string
  type: "entity" | "note"
  entityType?: string
  size: number
  mentionCount?: number
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
  clusters: Cluster[]
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

// ─── canvas colors (3-intensity system) ──────────────────────────────────────

// Single-hue base colors — intensity varies by selection state, not entity type
const BASE_ENTITY: [number, number, number] = [99, 102, 241]  // indigo
const BASE_NOTE:   [number, number, number] = [212, 119, 92]  // --accent terracotta

// Alpha intensity levels
const ALPHA_PRIMARY = 0.90  // selected entity
const ALPHA_MEDIUM  = 0.45  // connected entities + idle state
const ALPHA_LIGHT   = 0.12  // distant/unconnected entities

// ─── CSS entity colors (for DOM panels) ──────────────────────────────────────

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
  return ENTITY_COLORS[type] ?? { bg: "rgba(128,128,160,0.10)", text: "var(--text-2)", border: "var(--border)" }
}

// ─── convex hull (Graham scan) ────────────────────────────────────────────────

function cross(O: [number, number], A: [number, number], B: [number, number]) {
  return (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0])
}

function convexHull(pts: [number, number][]): [number, number][] | null {
  if (pts.length < 2) return null

  // For exactly 2 points, return a padded rectangle around the segment
  if (pts.length === 2) {
    const [ax, ay] = pts[0]
    const [bx, by] = pts[1]
    const dx = bx - ax
    const dy = by - ay
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const px = (-dy / len) * 22
    const py = (dx / len) * 22
    return [
      [ax + px, ay + py],
      [bx + px, by + py],
      [bx - px, by - py],
      [ax - px, ay - py],
    ]
  }

  const sorted = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const lower: [number, number][] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop()
    lower.push(p)
  }
  const upper: [number, number][] = []
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

// Expand hull points outward from centroid by `padding` px
function expandHull(hull: [number, number][], padding: number): [number, number][] {
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length
  return hull.map(([x, y]) => {
    const dx = x - cx
    const dy = y - cy
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    return [x + (dx / len) * padding, y + (dy / len) * padding]
  })
}

// ─── insight icon map ─────────────────────────────────────────────────────────

const INSIGHT_ICONS: Record<string, string> = {
  hidden_connection: "🔗",
  knowledge_gap:     "🕳",
  trending_topic:    "📈",
  orphan_alert:      "⚠",
  timeline_conflict: "⏰",
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const INSIGHTS_CACHE_TTL = 2 * 60 * 60 * 1000 // 2 hours

function getCachedInsights(userId: string): Insight[] | null {
  try {
    const raw = localStorage.getItem(`graph_insights_${userId}`)
    if (!raw) return null
    const { insights, ts } = JSON.parse(raw)
    if (Date.now() - ts > INSIGHTS_CACHE_TTL) return null
    return insights
  } catch {
    return null
  }
}

function setCachedInsights(userId: string, insights: Insight[]) {
  try {
    localStorage.setItem(`graph_insights_${userId}`, JSON.stringify({ insights, ts: Date.now() }))
  } catch {}
}

function getDismissedInsightIds(): Set<string> {
  try {
    const raw = localStorage.getItem("graph_insights_dismissed")
    return new Set(JSON.parse(raw ?? "[]"))
  } catch {
    return new Set()
  }
}

function addDismissedInsightId(id: string) {
  try {
    const existing = getDismissedInsightIds()
    existing.add(id)
    localStorage.setItem("graph_insights_dismissed", JSON.stringify([...existing]))
  } catch {}
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// ─── InsightCard component ────────────────────────────────────────────────────

function InsightCard({
  insight,
  onDismiss,
}: {
  insight: Insight
  onDismiss: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const icon = INSIGHT_ICONS[insight.type] ?? "💡"

  function handleAction() {
    if (insight.suggested_action === "create_note") {
      window.location.href = "/notes?compose=1"
    } else if (insight.suggested_action === "link_entities") {
      const text = encodeURIComponent(`Link: ${insight.title}`)
      window.location.href = `/notes?compose=1&text=${text}`
    }
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "var(--bg-elevated)" : "var(--bg-surface)",
        border: "1px solid var(--ai-border, var(--border))",
        borderRadius: "10px",
        padding: "12px 14px",
        transition: "background 0.18s ease-in-out",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px", flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: "14px", flexShrink: 0 }}>{icon}</span>
          <span style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--accent)",
            lineHeight: 1.4,
          }}>
            {insight.title}
          </span>
        </div>
        <button
          onClick={onDismiss}
          title="Dismiss"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontSize: "14px",
            color: "var(--text-3)",
            padding: "0 2px",
            lineHeight: 1,
            flexShrink: 0,
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-1)" }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)" }}
        >
          ✕
        </button>
      </div>

      {/* Description */}
      <p style={{ fontSize: "12px", color: "var(--text-2)", lineHeight: 1.6, margin: 0 }}>
        {insight.description}
      </p>

      {/* Action button */}
      {insight.suggested_action !== "none" && (
        <button
          onClick={handleAction}
          style={{
            alignSelf: "flex-start",
            marginTop: "2px",
            padding: "4px 10px",
            fontSize: "11px",
            fontWeight: 500,
            background: "var(--accent-dim, rgba(212,119,92,0.12))",
            color: "var(--accent)",
            border: "1px solid var(--ai-border, var(--border))",
            borderRadius: "6px",
            cursor: "pointer",
            transition: "filter 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)" }}
          onMouseLeave={(e) => { e.currentTarget.style.filter = "none" }}
        >
          {insight.suggested_action === "create_note" ? "Create Note" : "Link These"}
        </button>
      )}
    </div>
  )
}

// ─── small components ────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "6px 0",
      borderBottom: "1px solid var(--border-subtle)",
    }}>
      <span style={{ fontSize: "12px", color: "var(--text-2)" }}>{label}</span>
      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-1)" }}>{value}</span>
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
        background: hovered ? "var(--bg-hover)" : "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        padding: "12px 14px",
        cursor: "pointer",
        transition: "background 0.15s",
        fontSize: "12px",
        lineHeight: 1.6,
        color: "var(--text-2)",
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
  const [theme, setTheme] = useState<"dark" | "light">("dark")
  const [entitySummary, setEntitySummary] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [insights, setInsights] = useState<Insight[]>([])
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [clusterLabels, setClusterLabels] = useState<Record<string, string>>({})
  const [userId, setUserId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const fgRef = useRef<any>(null)
  const hasCenteredRef = useRef(false)

  // Refs for canvas interaction (avoids re-renders during animation loop)
  const hoveredNodeIdRef = useRef<string | null>(null)
  const clickedEntityIdRef = useRef<string | null>(null)
  const adjacencyRef = useRef<Map<string, Set<string>>>(new Map())
  const clusterLabelsRef = useRef<Record<string, string>>({})
  const summaryCache = useRef<Record<string, string>>({})

  // Keep ref in sync with state (used in canvas render callback)
  useEffect(() => {
    clusterLabelsRef.current = clusterLabels
  }, [clusterLabels])

  // Sync theme from html[data-theme]
  useEffect(() => {
    const html = document.documentElement
    const initial = (html.getAttribute("data-theme") ?? localStorage.getItem("theme") ?? "dark") as "dark" | "light"
    setTheme(initial)
    const observer = new MutationObserver(() => {
      setTheme((html.getAttribute("data-theme") ?? "dark") as "dark" | "light")
    })
    observer.observe(html, { attributes: true, attributeFilter: ["data-theme"] })
    return () => observer.disconnect()
  }, [])

  // Track cursor globally
  useEffect(() => {
    const onMove = (e: MouseEvent) => setHoverPos({ x: e.clientX, y: e.clientY })
    window.addEventListener("mousemove", onMove)
    return () => window.removeEventListener("mousemove", onMove)
  }, [])

  // Load dismissed IDs from localStorage
  useEffect(() => {
    setDismissedIds(getDismissedInsightIds())
  }, [])

  // Fetch graph + trigger insights
  useEffect(() => {
    getSupabaseBrowser().auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      fetch("/api/graph")
        .then((r) => r.json())
        .then((d: GraphData) => setData(d))
        .catch((err) => console.error("Graph fetch failed:", err))
    })
  }, [])

  // Load insights once we have graph data + userId
  useEffect(() => {
    if (!data || !userId) return
    const cached = getCachedInsights(userId)
    if (cached) {
      setInsights(cached)
      return
    }
    setInsightsLoading(true)
    fetch("/api/graph/insights")
      .then((r) => r.json())
      .then(({ insights: fetched }) => {
        const list: Insight[] = fetched ?? []
        setInsights(list)
        setCachedInsights(userId, list)
      })
      .catch(() => {})
      .finally(() => setInsightsLoading(false))
  }, [data, userId])

  // Fetch AI cluster labels after graph data arrives
  useEffect(() => {
    if (!data?.clusters || data.clusters.length === 0) return

    // Deterministic fallback: use first entity ID per cluster while AI loads
    const fallback: Record<string, string> = {}
    for (const cluster of data.clusters) {
      const firstNode = data.nodes.find(
        (n) => n.type === "entity" && cluster.entityIds.includes(n.id)
      )
      fallback[cluster.id] = firstNode?.label ?? "Group"
    }
    setClusterLabels(fallback)

    // Fetch AI labels in background
    fetch("/api/graph/cluster-labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clusters: data.clusters.map((c) => ({ id: c.id, entity_ids: c.entityIds })),
      }),
    })
      .then((r) => r.json())
      .then(({ labels }) => {
        if (!Array.isArray(labels)) return
        setClusterLabels((prev) => {
          const next = { ...prev }
          for (const { id, label } of labels) next[id] = label
          return next
        })
      })
      .catch(() => {})
  }, [data])

  // Build adjacency map when data changes
  useEffect(() => {
    if (!data) return
    const adj = new Map<string, Set<string>>()
    for (const link of data.links) {
      const src = typeof link.source === "object" ? (link.source as any).id : link.source as string
      const tgt = typeof link.target === "object" ? (link.target as any).id : link.target as string
      if (!adj.has(src)) adj.set(src, new Set())
      if (!adj.has(tgt)) adj.set(tgt, new Set())
      adj.get(src)!.add(tgt)
      adj.get(tgt)!.add(src)
    }
    adjacencyRef.current = adj
  }, [data])

  // Sync clickedEntityIdRef when panel changes
  useEffect(() => {
    clickedEntityIdRef.current = panel.kind === "entity" ? panel.entityId : null
  }, [panel])

  // Fetch entity summary lazily when entity panel opens
  useEffect(() => {
    if (panel.kind !== "entity") {
      setEntitySummary(null)
      return
    }
    const { entityId } = panel
    if (summaryCache.current[entityId]) {
      setEntitySummary(summaryCache.current[entityId])
      return
    }
    setSummaryLoading(true)
    setEntitySummary(null)
    fetch(`/api/entities/${entityId}/summary`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.summary) {
          summaryCache.current[entityId] = d.summary
          setEntitySummary(d.summary)
        }
      })
      .catch(() => {})
      .finally(() => setSummaryLoading(false))
  }, [panel])

  // Memoize percentile thresholds
  const { maxMentionCount, p70Threshold, top10Threshold } = useMemo(() => {
    if (!data) return { maxMentionCount: 1, p70Threshold: 0, top10Threshold: 0 }
    const counts = data.nodes
      .filter(n => n.type === "entity")
      .map(n => (n as any).mentionCount || 0)
      .sort((a: number, b: number) => a - b)
    const max = Math.max(1, ...counts)
    const p70 = counts[Math.floor(counts.length * 0.7)] ?? 0
    const top10 = counts[Math.floor(counts.length * 0.9)] ?? 0
    return { maxMentionCount: max, p70Threshold: p70, top10Threshold: top10 }
  }, [data])

  // Normalized log-scale node size
  const computeNodeSize = useCallback((node: any): number => {
    if (node.type === "note") return 5
    const mc = node.mentionCount || 0
    return 14 + (Math.log(mc + 1) / Math.log(maxMentionCount + 1)) * 28
  }, [maxMentionCount])

  // Configure physics
  useEffect(() => {
    if (!data || !fgRef.current) return
    const fg = fgRef.current
    hasCenteredRef.current = false
    fg.d3Force("charge")?.strength(-600)
    fg.d3Force("link")?.distance((link: any) => {
      const s = typeof link.source === "object" ? computeNodeSize(link.source) : 14
      const t = typeof link.target === "object" ? computeNodeSize(link.target) : 14
      return 80 + (s + t) * 1.5
    })
    fg.d3Force(
      "collision",
      d3.forceCollide((node: any) => computeNodeSize(node) / 2 + 6)
    )
  }, [data, computeNodeSize])

  // Auto-center on biggest entity once simulation settles
  function handleEngineStop() {
    if (hasCenteredRef.current || !fgRef.current || !data) return
    hasCenteredRef.current = true
    const biggest = data.nodes
      .filter((n) => n.type === "entity")
      .sort((a, b) => (b.mentionCount ?? 0) - (a.mentionCount ?? 0))[0]
    if (biggest?.x != null) {
      fgRef.current.centerAt(biggest.x, biggest.y, 600)
      fgRef.current.zoom(2.2, 600)
    } else {
      fgRef.current.zoomToFit(400, 80)
    }
  }

  // Hover
  async function handleNodeHover(node: any) {
    hoveredNodeIdRef.current = node?.id ?? null
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

  function handleRefreshInsights() {
    if (!userId) return
    localStorage.removeItem(`graph_insights_${userId}`)
    setInsightsLoading(true)
    fetch("/api/graph/insights")
      .then((r) => r.json())
      .then(({ insights: fetched }) => {
        const list: Insight[] = fetched ?? []
        setInsights(list)
        setCachedInsights(userId, list)
      })
      .catch(() => {})
      .finally(() => setInsightsLoading(false))
  }

  function handleDismiss(id: string) {
    addDismissedInsightId(id)
    setDismissedIds((prev) => new Set([...prev, id]))
  }

  const visibleInsights = insights.filter((i) => !dismissedIds.has(i.id))

  // Theme-dependent canvas values
  const isLight = theme === "light"
  const canvasBg      = isLight ? "#f5f5fb" : "#0d0d14"
  const linkColorBase = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)"
  const particleColor = isLight ? "rgba(99,102,241,0.6)" : "rgba(99,102,241,0.5)"

  // Cluster hull renderer — called before nodes each frame
  const renderClusters = useCallback((ctx: CanvasRenderingContext2D) => {
    if (!data?.clusters) return
    for (const cluster of data.clusters) {
      const points: [number, number][] = cluster.entityIds
        .map((id) => data.nodes.find((n) => n.id === id))
        .filter((n): n is GraphNode => !!n && n.x != null && n.y != null)
        .map((n) => [n.x!, n.y!])

      if (points.length < 2) continue
      const hull = convexHull(points)
      if (!hull || hull.length < 3) continue
      const expanded = expandHull(hull, 24)

      const [cr, cg, cb] = cluster.color

      // Filled hull
      ctx.beginPath()
      ctx.moveTo(expanded[0][0], expanded[0][1])
      for (let i = 1; i < expanded.length; i++) {
        ctx.lineTo(expanded[i][0], expanded[i][1])
      }
      ctx.closePath()
      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.07)`
      ctx.fill()
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.18)`
      ctx.lineWidth = 0.8
      ctx.setLineDash([4, 4])
      ctx.stroke()
      ctx.setLineDash([])

      // Cluster label at centroid
      const cx = points.reduce((s, p) => s + p[0], 0) / points.length
      const cy = points.reduce((s, p) => s + p[1], 0) / points.length
      const label = clusterLabelsRef.current[cluster.id] ?? ""
      if (label) {
        ctx.font = "500 9px -apple-system, BlinkMacSystemFont, sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillStyle = `rgba(${cr},${cg},${cb},0.60)`
        ctx.fillText(label.toUpperCase(), cx, cy)
      }
    }
  }, [data])

  // Loading screen
  if (!data) {
    return (
      <div style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-base)",
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
        <p style={{ fontSize: "13px", color: "var(--text-3)", margin: 0 }}>Loading graph…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{
      height: "100vh",
      display: "grid",
      gridTemplateColumns: panelOpen ? "1fr 400px" : "1fr 0px",
      background: "var(--bg-base)",
      position: "relative",
      transition: "grid-template-columns 0.28s ease-in-out",
    }}>

      {/* ── GRAPH CANVAS ── */}
      <div style={{ overflow: "hidden", position: "relative" }}>
        {/* Floating "See Graph Insights" button — visible only when panel is closed */}
        {!panelOpen && (
          <button
            onClick={() => setPanelOpen(true)}
            style={{
              position: "absolute",
              bottom: "24px",
              right: "24px",
              zIndex: 10,
              padding: "9px 16px",
              fontSize: "12px",
              fontWeight: 600,
              background: "var(--accent, #D4775C)",
              color: "#fff",
              border: "none",
              borderRadius: "10px",
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(212,119,92,0.35)",
              letterSpacing: "0.01em",
              transition: "filter 0.15s, transform 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = "brightness(1.1)"
              e.currentTarget.style.transform = "translateY(-1px)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = "none"
              e.currentTarget.style.transform = "none"
            }}
          >
            See Graph Insights
          </button>
        )}

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
              color: "var(--text-2)",
              background: isLight ? "rgba(245,245,251,0.88)" : "rgba(18,18,26,0.85)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              textDecoration: "none",
              backdropFilter: "blur(12px)",
              transition: "color 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--text-1)"
              ;(e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)"
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--text-2)"
              ;(e.currentTarget as HTMLElement).style.borderColor = "var(--border)"
            }}
          >
            ☰ All Notes
          </Link>
        </div>

        <ForceGraph2D
          ref={fgRef}
          graphData={data}
          backgroundColor={canvasBg}
          nodeVal={(node: any) => {
            const r = computeNodeSize(node) / 2
            return (r / 4) ** 2
          }}
          nodeRelSize={4}
          linkWidth={(link: any) => (link.weight || 1) * 0.5}
          linkColor={(link: any) => {
            const src = typeof link.source === "object" ? (link.source as any).id : link.source
            const tgt = typeof link.target === "object" ? (link.target as any).id : link.target
            const activeId = hoveredNodeIdRef.current ?? clickedEntityIdRef.current
            if (activeId) {
              if (src === activeId || tgt === activeId)
                return isLight ? "rgba(99,102,241,0.40)" : "rgba(99,102,241,0.35)"
              return isLight ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.01)"
            }
            return linkColorBase
          }}
          linkDirectionalParticles={2}
          linkDirectionalParticleSpeed={0.004}
          linkDirectionalParticleColor={() => particleColor}
          cooldownTicks={100}
          d3VelocityDecay={0.3}
          onEngineStop={handleEngineStop}
          onRenderFramePre={renderClusters}
          nodeCanvasObjectMode={() => "replace"}
          nodeCanvasObject={(node: any, ctx, globalScale) => {
            const { x, y } = node
            const isEntity = node.type === "entity"
            const mc = (node.mentionCount || 0) as number
            const size = computeNodeSize(node)
            const r = size / 2

            // Determine selection state
            const hovId = hoveredNodeIdRef.current
            const clkId = clickedEntityIdRef.current
            const activeId = hovId ?? clkId
            const isActive = node.id === activeId
            const isConnected = !!activeId && !!adjacencyRef.current.get(activeId)?.has(node.id)

            // 3-intensity alpha: primary / medium / light
            let alpha: number
            if (!isEntity) {
              alpha = activeId ? 0.10 : 0.20
            } else if (!activeId) {
              alpha = ALPHA_MEDIUM          // idle — all entities uniform
            } else if (isActive) {
              alpha = ALPHA_PRIMARY         // selected
            } else if (isConnected) {
              alpha = ALPHA_MEDIUM          // 1-hop neighbor
            } else {
              alpha = ALPHA_LIGHT           // distant
            }

            // Scale up hovered node slightly
            const drawR = (isActive && !!hovId) ? r * 1.08 : r

            // Glow ring for top-10% hub entities
            const isTop10 = isEntity && top10Threshold > 0 && mc >= top10Threshold
            if (isTop10 && alpha > ALPHA_LIGHT) {
              ctx.beginPath()
              ctx.arc(x, y, drawR + 4, 0, 2 * Math.PI)
              ctx.strokeStyle = `rgba(99,102,241,${0.30 * alpha})`
              ctx.lineWidth = 1.2
              ctx.stroke()
            }

            // Main circle — single hue, intensity-based
            const [cr, cg, cb] = isEntity ? BASE_ENTITY : BASE_NOTE
            ctx.beginPath()
            ctx.arc(x, y, drawR, 0, 2 * Math.PI)
            ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`
            ctx.fill()

            // Label (entity nodes only, skip if radius too small)
            if (isEntity && drawR >= 7) {
              const rawFont = Math.min(size * 0.42, 16)
              const fontSize = Math.max(9, rawFont / Math.max(1, globalScale))
              const weight = mc >= p70Threshold ? 600 : 500
              ctx.font = `${weight} ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`
              ctx.textAlign = "center"
              ctx.textBaseline = "top"
              if (size >= 28 && !isLight) {
                ctx.shadowColor = "rgba(0,0,0,0.35)"
                ctx.shadowBlur = 2
                ctx.shadowOffsetY = 1
              }
              const labelAlpha = Math.min(1, alpha + 0.15)
              ctx.fillStyle = isLight
                ? `rgba(26,26,46,${labelAlpha})`
                : `rgba(200,200,215,${labelAlpha})`
              ctx.fillText(node.label || node.id, x, y + drawR + 3)
              ctx.shadowColor = "transparent"
              ctx.shadowBlur = 0
              ctx.shadowOffsetY = 0
            }
          }}
          onNodeHover={handleNodeHover}
          onNodeClick={handleNodeClick}
        />
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{
        background: "var(--bg-surface)",
        borderLeft: panelOpen ? "1px solid var(--border)" : "none",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minWidth: 0,
      }}>
        {/* Panel header */}
        <div style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          {/* Top row: back button (detail view) or close button (always) */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <div>
              {(panel.kind === "note" || panel.kind === "entity") && (
                <button
                  onClick={() => setPanel({ kind: "idle" })}
                  style={{
                    fontSize: "12px",
                    color: "var(--text-3)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    transition: "color 0.12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-2)" }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)" }}
                >
                  ← Back
                </button>
              )}
            </div>
            <button
              onClick={() => setPanelOpen(false)}
              title="Close panel"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: "16px",
                lineHeight: 1,
                color: "var(--text-3)",
                padding: "2px 4px",
                borderRadius: "4px",
                transition: "color 0.12s, background 0.12s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text-1)"
                e.currentTarget.style.background = "var(--bg-elevated)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-3)"
                e.currentTarget.style.background = "transparent"
              }}
            >
              ×
            </button>
          </div>
          <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-1)", margin: 0 }}>
            {panel.kind === "entity"
              ? panel.entityLabel
              : panel.kind === "note" || panel.kind === "note-loading"
              ? "Note"
              : "Knowledge Graph"}
          </h2>
          {panel.kind === "idle" && (
            <p style={{ fontSize: "12px", color: "var(--text-3)", margin: "6px 0 0" }}>
              Click any node to explore
            </p>
          )}
        </div>

        {/* Panel body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

          {panel.kind === "idle" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {/* Compact stats */}
              <Stat label="Nodes" value={data.nodes.length} />
              <Stat label="Entities" value={data.nodes.filter((n) => n.type === "entity").length} />
              <Stat label="Notes" value={data.nodes.filter((n) => n.type === "note").length} />
              <Stat label="Connections" value={data.links.length} />

              {/* AI Insights section */}
              <div style={{ marginTop: "20px" }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "12px",
                }}>
                  <span style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: "var(--accent)",
                  }}>
                    AI Insights
                  </span>
                  <button
                    onClick={handleRefreshInsights}
                    disabled={insightsLoading}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: insightsLoading ? "default" : "pointer",
                      fontSize: "11px",
                      color: insightsLoading ? "var(--text-3)" : "var(--text-2)",
                      padding: 0,
                      transition: "color 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      if (!insightsLoading) e.currentTarget.style.color = "var(--text-1)"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = insightsLoading ? "var(--text-3)" : "var(--text-2)"
                    }}
                  >
                    {insightsLoading ? "Analyzing…" : "↺ Refresh"}
                  </button>
                </div>

                {/* Loading skeleton */}
                {insightsLoading && visibleInsights.length === 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="skeleton" style={{
                        height: "80px",
                        borderRadius: "10px",
                      }} />
                    ))}
                  </div>
                )}

                {/* Insight cards */}
                {!insightsLoading && visibleInsights.length === 0 && (
                  <p style={{ fontSize: "12px", color: "var(--text-3)", textAlign: "center", marginTop: "12px" }}>
                    No insights yet. Add more notes to generate insights.
                  </p>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {visibleInsights.map((insight) => (
                    <InsightCard
                      key={insight.id}
                      insight={insight}
                      onDismiss={() => handleDismiss(insight.id)}
                    />
                  ))}
                </div>
              </div>
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
              <p style={{ fontSize: "11px", color: "var(--text-3)", margin: "0 0 16px" }}>
                {formatDate(panel.note.createdAt)}
              </p>
              <p style={{
                fontSize: "13px",
                lineHeight: 1.75,
                color: "var(--text-1)",
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
                    color: "var(--text-3)",
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
              {/* Entity summary */}
              {summaryLoading && (
                <div style={{ marginBottom: "20px" }}>
                  {[90, 75, 85].map((w, i) => (
                    <div key={i} className="skeleton" style={{ height: "12px", borderRadius: "5px", width: `${w}%`, marginBottom: "8px" }} />
                  ))}
                </div>
              )}
              {entitySummary && !summaryLoading && (
                <div style={{
                  fontSize: "12.5px",
                  lineHeight: 1.7,
                  color: "var(--text-2)",
                  whiteSpace: "pre-wrap",
                  marginBottom: "24px",
                  paddingBottom: "20px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}>
                  {entitySummary}
                </div>
              )}

              {panel.notes.length === 0 ? (
                <p style={{ fontSize: "13px", color: "var(--text-3)" }}>
                  No notes linked to this entity.
                </p>
              ) : (
                <>
                  <p style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: "var(--text-3)",
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

      </div>

      {/* ── HOVER POPUP ── */}
      {hoveredNote && (
        <div style={{
          position: "fixed",
          top: hoverPos.y + 16,
          left: hoverPos.x + 16,
          background: "var(--bg-elevated)",
          padding: "12px 16px",
          borderRadius: "10px",
          boxShadow: "var(--shadow-lg)",
          maxWidth: "320px",
          fontSize: "13px",
          lineHeight: 1.6,
          zIndex: 1000,
          pointerEvents: "none",
          whiteSpace: "pre-wrap",
          border: "1px solid var(--border)",
          color: "var(--text-1)",
        }}>
          {hoveredNote.content
            ? hoveredNote.content.slice(0, 160) + (hoveredNote.content.length > 160 ? "…" : "")
            : "Loading…"}
        </div>
      )}
    </div>
  )
}
