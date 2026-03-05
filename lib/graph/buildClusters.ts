export type Cluster = {
  id: string
  entityIds: string[]
  color: [number, number, number]
}

// Muted colors distinct from node ENTITY_FILL colors
const CLUSTER_PALETTE: [number, number, number][] = [
  [120, 100, 220], // soft violet
  [80, 180, 140],  // soft teal
  [220, 160, 60],  // soft amber
  [200, 100, 160], // soft rose
  [80, 140, 210],  // soft sky
  [160, 120, 80],  // soft brown
  [100, 180, 100], // soft green
  [200, 120, 80],  // soft orange
]

export function buildClusters(
  entities: { id: string }[],
  links: { entity_id: string; knowledge_id: string }[]
): Cluster[] {
  const parent: Record<string, string> = {}

  function find(x: string): string {
    if (parent[x] !== x) parent[x] = find(parent[x])
    return parent[x]
  }

  function union(a: string, b: string) {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  // Initialize: each entity is its own root
  for (const e of entities) parent[e.id] = e.id

  // Group entity_ids by note, then union entities that share a note
  const noteToEntities: Record<string, string[]> = {}
  for (const link of links) {
    if (parent[link.entity_id] === undefined) continue // orphan link
    if (!noteToEntities[link.knowledge_id]) noteToEntities[link.knowledge_id] = []
    noteToEntities[link.knowledge_id].push(link.entity_id)
  }

  for (const group of Object.values(noteToEntities)) {
    for (let i = 1; i < group.length; i++) {
      union(group[0], group[i])
    }
  }

  // Collect clusters by root
  const groups: Record<string, string[]> = {}
  for (const e of entities) {
    const root = find(e.id)
    if (!groups[root]) groups[root] = []
    groups[root].push(e.id)
  }

  return Object.values(groups)
    .filter((ids) => ids.length >= 2)
    .map((ids, i) => ({
      id: `cluster-${i}`,
      entityIds: ids,
      color: CLUSTER_PALETTE[i % CLUSTER_PALETTE.length],
    }))
}
