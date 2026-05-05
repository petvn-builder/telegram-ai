"use client"

import type { RankedCluster } from "@/lib/graph/clusterRank"

type Props = {
  cluster: RankedCluster
  x: number
  y: number
  r: number
  onClick: () => void
}

export function ClusterBubble({ cluster, x, y, r, onClick }: Props) {
  const [cr, cg, cb] = cluster.color
  const fill = `rgba(${cr}, ${cg}, ${cb}, 0.14)`
  const stroke = `rgba(${cr}, ${cg}, ${cb}, 0.55)`
  const labelSize = Math.max(11, Math.min(18, r / 5))
  const subSize = Math.max(9, Math.min(13, r / 7))
  const label = cluster.label ?? cluster.hubEntityName

  return (
    <g
      onClick={onClick}
      style={{ cursor: "pointer" }}
      transform={`translate(${x}, ${y})`}
    >
      <circle
        r={r}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
        style={{ transition: "fill 180ms ease, stroke 180ms ease" }}
      />
      <text
        textAnchor="middle"
        dy={-2}
        fontSize={labelSize}
        fontWeight={600}
        fill="var(--text-1)"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {truncate(label, Math.max(8, Math.floor(r / 4)))}
      </text>
      <text
        textAnchor="middle"
        dy={labelSize + 2}
        fontSize={subSize}
        fill="var(--text-3)"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {cluster.memberCount} entities
        {cluster.recentNoteCount > 0 ? ` · +${cluster.recentNoteCount} 14d` : ""}
      </text>
    </g>
  )
}

function truncate(s: string, max: number) {
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + "…"
}
