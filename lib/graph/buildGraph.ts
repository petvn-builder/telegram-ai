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

export type EntityNode = {
  id: string
  label: string
  type: "entity"
  entityType: string
  size: number
  mentionCount: number
}

export type EntityEdge = {
  source: string
  target: string
  weight: number
}

export type EntityGraph = {
  nodes: EntityNode[]
  links: EntityEdge[]
  clusters: Cluster[]
  orphanIds: string[]
}

export function buildEntityGraph(
  entities: EntityRow[],
  knowledgeLinks: KnowledgeLinkRow[]
): EntityGraph {
  const entityMentionCount: Record<string, number> = {}
  const noteToEntities: Record<string, Set<string>> = {}

  for (const link of knowledgeLinks) {
    entityMentionCount[link.entity_id] =
      (entityMentionCount[link.entity_id] || 0) + 1
    if (!noteToEntities[link.knowledge_id]) {
      noteToEntities[link.knowledge_id] = new Set()
    }
    noteToEntities[link.knowledge_id].add(link.entity_id)
  }

  const nodes: EntityNode[] = entities.map((entity) => {
    const mentionCount = entityMentionCount[entity.id] || 0
    return {
      id: entity.id,
      label: entity.name,
      type: "entity",
      entityType: entity.type,
      mentionCount,
      size: 6 + Math.log(mentionCount + 1) * 4,
    }
  })

  const edgeWeights: Record<string, number> = {}
  for (const ids of Object.values(noteToEntities)) {
    const arr = [...ids]
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const [a, b] = arr[i] < arr[j] ? [arr[i], arr[j]] : [arr[j], arr[i]]
        const key = `${a}|${b}`
        edgeWeights[key] = (edgeWeights[key] || 0) + 1
      }
    }
  }

  const links: EntityEdge[] = Object.entries(edgeWeights).map(([key, weight]) => {
    const [source, target] = key.split("|")
    return { source, target, weight }
  })

  const { clusters, orphanIds } = buildClusters(entities, knowledgeLinks)

  return { nodes, links, clusters, orphanIds }
}
