"use client"

import { useEffect, useRef, useState } from "react"
import { ClusterBubble } from "./ClusterBubble"
import { packBubbles, type PackedBubble } from "./packBubbles"
import type { RankedCluster } from "@/lib/graph/clusterRank"

type Props = {
  clusters: RankedCluster[]
  orphanCount: number
  onSelect: (clusterId: string) => void
  onSelectOrphans?: () => void
  onPlaced?: (placed: PackedBubble[], size: { w: number; h: number }) => void
  overlay?: React.ReactNode
}

export function ClusterOverview({ clusters, orphanCount, onSelect, onSelectOrphans, onPlaced, overlay }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 1000, h: 700 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setSize({ w: rect.width, h: rect.height })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const [placed, setPlaced] = useState<PackedBubble[]>([])

  useEffect(() => {
    const next = packBubbles(clusters, size.w, size.h)
    setPlaced(next)
    onPlaced?.(next, size)
  }, [clusters, size, onPlaced])

  const orphanR = orphanCount > 0 ? 28 + Math.min(40, Math.log(orphanCount + 1) * 10) : 0
  const orphanX = size.w - orphanR - 24
  const orphanY = size.h - orphanR - 24

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, background: "var(--bg-base)" }}>
      <svg width={size.w} height={size.h} style={{ display: "block" }}>
        {placed.map((p) => (
          <ClusterBubble
            key={p.cluster.id}
            cluster={p.cluster}
            x={p.x}
            y={p.y}
            r={p.r}
            onClick={() => onSelect(p.cluster.id)}
          />
        ))}
        {orphanCount > 0 && (
          <g
            transform={`translate(${orphanX}, ${orphanY})`}
            style={{ cursor: onSelectOrphans ? "pointer" : "default" }}
            onClick={onSelectOrphans}
          >
            <circle
              r={orphanR}
              fill="rgba(150,150,160,0.08)"
              stroke="rgba(150,150,160,0.4)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <text textAnchor="middle" dy={-2} fontSize={12} fontWeight={600} fill="var(--text-2)" style={{ pointerEvents: "none", userSelect: "none" }}>
              Loose threads
            </text>
            <text textAnchor="middle" dy={12} fontSize={11} fill="var(--text-3)" style={{ pointerEvents: "none", userSelect: "none" }}>
              {orphanCount}
            </text>
          </g>
        )}
        {overlay}
      </svg>
      {clusters.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-3)",
            fontSize: 14,
          }}
        >
          No clusters yet — keep capturing notes.
        </div>
      )}
    </div>
  )
}
