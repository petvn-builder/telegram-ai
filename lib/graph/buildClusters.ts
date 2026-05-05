export type Cluster = {
  id: string
  entityIds: string[]
  color: [number, number, number]
}

export type ClusterResult = {
  clusters: Cluster[]
  orphanIds: string[]
}

const CLUSTER_PALETTE: [number, number, number][] = [
  [120, 100, 220],
  [80, 180, 140],
  [220, 160, 60],
  [200, 100, 160],
  [80, 140, 210],
  [160, 120, 80],
  [100, 180, 100],
  [200, 120, 80],
]

export function buildClusters(
  entities: { id: string }[],
  links: { entity_id: string; knowledge_id: string }[]
): ClusterResult {
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

  for (const e of entities) parent[e.id] = e.id

  const noteToEntities: Record<string, string[]> = {}
  for (const link of links) {
    if (parent[link.entity_id] === undefined) continue
    if (!noteToEntities[link.knowledge_id]) noteToEntities[link.knowledge_id] = []
    noteToEntities[link.knowledge_id].push(link.entity_id)
  }

  for (const group of Object.values(noteToEntities)) {
    for (let i = 1; i < group.length; i++) {
      union(group[0], group[i])
    }
  }

  const groups: Record<string, string[]> = {}
  for (const e of entities) {
    const root = find(e.id)
    if (!groups[root]) groups[root] = []
    groups[root].push(e.id)
  }

  const clusters: Cluster[] = []
  const orphanIds: string[] = []
  let i = 0
  for (const ids of Object.values(groups)) {
    if (ids.length >= 2) {
      clusters.push({
        id: `cluster-${i}`,
        entityIds: ids,
        color: CLUSTER_PALETTE[i % CLUSTER_PALETTE.length],
      })
      i++
    } else {
      orphanIds.push(ids[0])
    }
  }

  return { clusters, orphanIds }
}
