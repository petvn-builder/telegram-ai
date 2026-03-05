import { buildClusters, type Cluster } from "./buildClusters"

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
  content: string
}

export type GraphNode = {
  id: string
  label?: string
  type: "entity" | "note"
  entityType?: string
  size: number
  mentionCount?: number
}

export type GraphLink = {
  source: string
  target: string
  type: "mention"
}

export type GraphResponse = {
  nodes: GraphNode[]
  links: GraphLink[]
  clusters: Cluster[]
}

export function buildGraph(
  entities: EntityRow[],
  knowledgeLinks: KnowledgeLinkRow[],
  notes: NoteRow[]
): GraphResponse {
  const nodes: GraphNode[] = []
  const links: GraphLink[] = []

  const entityMentionCount: Record<string, number> = {}
  const noteSet = new Set<string>()

  // Map notes by id for quick lookup
  const noteMap: Record<string, string> = {}
  for (const note of notes) {
    noteMap[note.id] = note.content
  }

  // Count mentions + collect note ids
  for (const link of knowledgeLinks) {
    entityMentionCount[link.entity_id] =
      (entityMentionCount[link.entity_id] || 0) + 1

    noteSet.add(link.knowledge_id)

    links.push({
      source: link.entity_id,
      target: link.knowledge_id,
      type: "mention",
    })
  }

  // Build entity nodes
  for (const entity of entities) {
    const mentionCount = entityMentionCount[entity.id] || 0

    nodes.push({
      id: entity.id,
      label: entity.name,
      type: "entity",
      entityType: entity.type,
      mentionCount,
      size: 6 + Math.log(mentionCount + 1) * 4,
    })
  }

  // Build note nodes with content label (shortened)
  for (const noteId of noteSet) {
    const content = noteMap[noteId] || ""

    nodes.push({
      id: noteId,
      label: content.slice(0, 60),
      type: "note",
      size: 3,
    })
  }

  const clusters = buildClusters(entities, knowledgeLinks)

  return { nodes, links, clusters }
}
  