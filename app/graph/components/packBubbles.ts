import type { RankedCluster } from "@/lib/graph/clusterRank"

export type PackedBubble = {
  cluster: RankedCluster
  x: number
  y: number
  r: number
}

export function packBubbles(clusters: RankedCluster[], w: number, h: number): PackedBubble[] {
  if (clusters.length === 0) return []
  const padding = 14
  const maxScore = Math.max(...clusters.map((c) => c.score), 1)
  const minR = 38
  const maxR = Math.min(w, h) * 0.18

  const sized = clusters.map((c) => {
    const norm = c.score / maxScore
    const r = minR + Math.sqrt(norm) * (maxR - minR)
    return { cluster: c, r }
  })
  sized.sort((a, b) => b.r - a.r)

  const cx = w / 2
  const cy = h / 2
  const placed: PackedBubble[] = []
  placed.push({ cluster: sized[0].cluster, r: sized[0].r, x: cx, y: cy })

  for (let i = 1; i < sized.length; i++) {
    const { cluster, r } = sized[i]
    const target = pickPosition(placed, r, padding, cx, cy)
    placed.push({ cluster, r, x: target.x, y: target.y })
  }

  for (const p of placed) {
    p.x = Math.max(p.r + 8, Math.min(w - p.r - 8, p.x))
    p.y = Math.max(p.r + 8, Math.min(h - p.r - 8, p.y))
  }
  return placed
}

function pickPosition(
  placed: PackedBubble[],
  r: number,
  pad: number,
  cx: number,
  cy: number
) {
  for (let ring = 1; ring < 60; ring++) {
    const baseDist = (placed[0]?.r ?? r) + r + pad + ring * 6
    const steps = 12 + ring * 4
    for (let s = 0; s < steps; s++) {
      const angle = (s / steps) * Math.PI * 2 + ring * 0.13
      const x = cx + Math.cos(angle) * baseDist
      const y = cy + Math.sin(angle) * baseDist
      if (fits(placed, x, y, r, pad)) return { x, y }
    }
  }
  return { x: cx, y: cy }
}

function fits(placed: PackedBubble[], x: number, y: number, r: number, pad: number) {
  for (const p of placed) {
    const dx = p.x - x
    const dy = p.y - y
    const minDist = p.r + r + pad
    if (dx * dx + dy * dy < minDist * minDist) return false
  }
  return true
}
