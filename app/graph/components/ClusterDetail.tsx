"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import type { ClusterDetailResponse } from "@/app/api/graph/cluster/[id]/route"

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false })

const MAX_ENTITY_NODES = 25

type GraphNode = {
  id: string
  kind: "entity" | "note"
  label?: string
  size: number
  mentionCount?: number
  fx?: number
  fy?: number
  x?: number
  y?: number
}

type GraphLink = {
  source: string
  target: string
  weight?: number
  kind: "entity" | "note"
}

type Props = {
  detail: ClusterDetailResponse
  hubAccentColor: [number, number, number]
  selectedEntityId: string | null
  onSelectEntity: (id: string) => void
}

export function ClusterDetail({ detail, hubAccentColor, selectedEntityId, onSelectEntity }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<{
    centerAt?: (x: number, y: number, ms: number) => void
    zoom?: (n: number, ms: number) => void
  } | null>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      setSize({ w: r.width, h: r.height })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const data = useMemo(() => buildSubgraph(detail), [detail])

  // Recenter on selected entity
  useEffect(() => {
    if (!selectedEntityId) return
    const node = data.nodes.find((n) => n.id === selectedEntityId)
    if (!node || node.x == null || node.y == null) return
    fgRef.current?.centerAt?.(node.x, node.y, 600)
    fgRef.current?.zoom?.(2.4, 600)
  }, [selectedEntityId, data])

  const [hr, hg, hb] = hubAccentColor

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, background: "var(--bg-base)" }}>
      <ForceGraph2D
        ref={fgRef as any}
        graphData={data}
        width={size.w}
        height={size.h}
        backgroundColor="transparent"
        nodeRelSize={4}
        d3AlphaDecay={0.03}
        d3VelocityDecay={0.35}
        linkWidth={(l: any) => (l.kind === "entity" ? Math.min(2.4, 0.6 + (l.weight ?? 1) * 0.3) : 0.4)}
        linkColor={(l: any) =>
          l.kind === "entity"
            ? `rgba(${hr}, ${hg}, ${hb}, 0.45)`
            : "rgba(140,140,150,0.18)"
        }
        cooldownTicks={120}
        onNodeClick={(node: any) => {
          if (node.kind === "entity") onSelectEntity(node.id as string)
        }}
        nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
          if (node.kind === "note") {
            ctx.beginPath()
            ctx.arc(node.x, node.y, 1.6, 0, Math.PI * 2)
            ctx.fillStyle = "rgba(140,140,150,0.32)"
            ctx.fill()
            return
          }
          const isHub = node.id === detail.hubEntityId
          const isSelected = node.id === selectedEntityId
          const r = node.size as number
          ctx.beginPath()
          ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
          const alpha = isSelected ? 0.95 : isHub ? 0.85 : 0.6
          ctx.fillStyle = `rgba(${hr}, ${hg}, ${hb}, ${alpha})`
          ctx.fill()
          if (isSelected) {
            ctx.lineWidth = 2 / globalScale
            ctx.strokeStyle = "var(--text-1)"
            ctx.strokeStyle = "rgba(255,255,255,0.9)"
            ctx.stroke()
          }
          // label
          const label = node.label as string
          if (!label) return
          const fontSize = Math.max(11, 12 / globalScale)
          ctx.font = `${isHub ? "600 " : ""}${fontSize}px ui-sans-serif, system-ui, sans-serif`
          ctx.textAlign = "center"
          ctx.textBaseline = "top"
          ctx.fillStyle = "rgba(20,20,24,0.92)"
          if (typeof document !== "undefined") {
            const isDark = document.documentElement.getAttribute("data-theme") === "dark"
            ctx.fillStyle = isDark ? "rgba(240,240,240,0.92)" : "rgba(20,20,24,0.92)"
          }
          ctx.fillText(label, node.x, node.y + r + 3)
        }}
        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
          if (node.kind !== "entity") return
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(node.x, node.y, (node.size as number) + 2, 0, Math.PI * 2)
          ctx.fill()
        }}
      />
    </div>
  )
}

function buildSubgraph(detail: ClusterDetailResponse): { nodes: GraphNode[]; links: GraphLink[] } {
  const sorted = [...detail.entities].sort((a, b) => b.mentionCount - a.mentionCount)
  const visible = sorted.slice(0, MAX_ENTITY_NODES)
  const visibleIds = new Set(visible.map((e) => e.id))

  const nodes: GraphNode[] = visible.map((e) => {
    const isHub = e.id === detail.hubEntityId
    const node: GraphNode = {
      id: e.id,
      kind: "entity",
      label: e.label,
      mentionCount: e.mentionCount,
      size: e.size,
    }
    if (isHub) {
      node.fx = 0
      node.fy = 0
    }
    return node
  })

  const links: GraphLink[] = []
  for (const edge of detail.edges) {
    if (visibleIds.has(edge.source) && visibleIds.has(edge.target)) {
      links.push({ source: edge.source, target: edge.target, weight: edge.weight, kind: "entity" })
    }
  }

  // Note dots — attach each note to its visible entities only
  for (const note of detail.notePreviews) {
    const targets = note.entityIds.filter((id) => visibleIds.has(id))
    if (targets.length === 0) continue
    nodes.push({ id: `note:${note.id}`, kind: "note", size: 1.5 })
    for (const t of targets) {
      links.push({ source: t, target: `note:${note.id}`, kind: "note" })
    }
  }

  return { nodes, links }
}
