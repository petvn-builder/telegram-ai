import type { Cluster } from "./buildClusters"

type EntityRow = {
  id: string
  name: string
  type: string
}

type KnowledgeLinkRow = {
  knowledge_id: string
  entity_id: string
}

type NoteRow = {
  id: string
  created_at: string | null
}

export type RankedCluster = {
  id: string
  label?: string
  score: number
  hubEntityId: string
  hubEntityName: string
  entityIds: string[]
  memberCount: number
  recentNoteCount: number
  color: [number, number, number]
}

const RECENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

export function rankClusters(
  clusters: Cluster[],
  entities: EntityRow[],
  links: KnowledgeLinkRow[],
  notes: NoteRow[]
): RankedCluster[] {
  const entityById: Record<string, EntityRow> = {}
  for (const e of entities) entityById[e.id] = e

  const mentionCount: Record<string, number> = {}
  const entityToNotes: Record<string, Set<string>> = {}
  for (const link of links) {
    mentionCount[link.entity_id] = (mentionCount[link.entity_id] || 0) + 1
    if (!entityToNotes[link.entity_id]) entityToNotes[link.entity_id] = new Set()
    entityToNotes[link.entity_id].add(link.knowledge_id)
  }

  const noteCreatedAt: Record<string, number> = {}
  const cutoff = Date.now() - RECENT_WINDOW_MS
  for (const note of notes) {
    if (!note.created_at) continue
    noteCreatedAt[note.id] = new Date(note.created_at).getTime()
  }

  return clusters
    .map((cluster) => {
      let totalMentions = 0
      let hubId = cluster.entityIds[0]
      let hubMentions = -1
      const noteIds = new Set<string>()

      for (const eid of cluster.entityIds) {
        const m = mentionCount[eid] || 0
        totalMentions += m
        if (m > hubMentions) {
          hubMentions = m
          hubId = eid
        }
        const notes = entityToNotes[eid]
        if (notes) for (const n of notes) noteIds.add(n)
      }

      let recentNoteCount = 0
      for (const nid of noteIds) {
        const t = noteCreatedAt[nid]
        if (t && t >= cutoff) recentNoteCount++
      }

      const score = totalMentions * 0.7 + Math.log(recentNoteCount + 1) * 0.3

      return {
        id: hubId,
        score,
        hubEntityId: hubId,
        hubEntityName: entityById[hubId]?.name ?? "Unknown",
        entityIds: cluster.entityIds,
        memberCount: cluster.entityIds.length,
        recentNoteCount,
        color: cluster.color,
      }
    })
    .sort((a, b) => b.score - a.score)
}
