"use client"

import type { Insight } from "@/app/api/graph/insights/route"
import type { PackedBubble } from "./packBubbles"

type Props = {
  placed: PackedBubble[]
  insights: Insight[]
  entityToClusterId: Record<string, string>
}

export function InsightOverlay({ placed, insights, entityToClusterId }: Props) {
  const bubbleById: Record<string, PackedBubble> = {}
  for (const p of placed) bubbleById[p.cluster.id] = p

  const pulseClusterIds = new Set<string>()
  const arcs: Array<{ a: PackedBubble; b: PackedBubble; key: string }> = []
  const seenArc = new Set<string>()

  for (const ins of insights) {
    const referencedClusters = new Set<string>()
    for (const eid of ins.entity_ids) {
      const cid = entityToClusterId[eid]
      if (cid && bubbleById[cid]) {
        referencedClusters.add(cid)
        pulseClusterIds.add(cid)
      }
    }

    if (ins.type === "hidden_connection" && referencedClusters.size >= 2) {
      const ids = [...referencedClusters]
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const [a, b] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]]
          const key = `${a}|${b}`
          if (seenArc.has(key)) continue
          seenArc.add(key)
          arcs.push({ a: bubbleById[a], b: bubbleById[b], key })
        }
      }
    }
  }

  return (
    <g style={{ pointerEvents: "none" }}>
      {/* Dotted arcs between clusters in hidden_connection insights */}
      {arcs.map(({ a, b, key }) => {
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        // perpendicular offset for arc
        const nx = -dy / dist
        const ny = dx / dist
        const lift = Math.min(80, dist * 0.18)
        const cx = mx + nx * lift
        const cy = my + ny * lift
        const path = `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`
        return (
          <path
            key={key}
            d={path}
            fill="none"
            stroke="var(--ai-accent, #5B8A7A)"
            strokeOpacity={0.7}
            strokeWidth={1.5}
            strokeDasharray="5 5"
          />
        )
      })}

      {/* Pulse rings on referenced cluster bubbles */}
      {[...pulseClusterIds].map((cid) => {
        const p = bubbleById[cid]
        if (!p) return null
        return (
          <g key={`pulse-${cid}`} transform={`translate(${p.x}, ${p.y})`}>
            <circle r={p.r + 4} fill="none" stroke="var(--ai-accent, #5B8A7A)" strokeOpacity={0.55} strokeWidth={2}>
              <animate attributeName="r" from={p.r + 2} to={p.r + 18} dur="1.6s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" from="0.6" to="0" dur="1.6s" repeatCount="indefinite" />
            </circle>
          </g>
        )
      })}
    </g>
  )
}
