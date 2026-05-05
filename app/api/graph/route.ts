import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { buildClusters } from "@/lib/graph/buildClusters"
import { rankClusters, type RankedCluster } from "@/lib/graph/clusterRank"

export type EntityIndexEntry = {
  id: string
  name: string
  clusterId: string | null
}

export type GraphOverviewResponse = {
  clusters: RankedCluster[]
  orphanCount: number
  entityIndex: EntityIndexEntry[]
}

export async function GET() {
  try {
    const authClient = await getSupabaseServer()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.id
    const db = getSupabaseAdmin()

    const [entitiesRes, linksRes, notesRes] = await Promise.all([
      db.from("entities").select("id, name, type").eq("user_id", userId).limit(500),
      db.from("knowledge_links").select("knowledge_id, entity_id").eq("user_id", userId),
      db.from("knowledge").select("id, created_at").eq("user_id", userId).eq("role", "note"),
    ])

    if (entitiesRes.error) throw entitiesRes.error
    if (linksRes.error) throw linksRes.error
    if (notesRes.error) throw notesRes.error

    const entities = entitiesRes.data ?? []
    const links = linksRes.data ?? []
    const notes = notesRes.data ?? []

    const { clusters, orphanIds } = buildClusters(entities, links)
    const ranked = rankClusters(clusters, entities, links, notes)

    const entityToCluster: Record<string, string> = {}
    for (const c of ranked) {
      for (const eid of c.entityIds) entityToCluster[eid] = c.id
    }
    const orphanSet = new Set(orphanIds)
    const entityIndex: EntityIndexEntry[] = entities.map((e) => ({
      id: e.id,
      name: e.name,
      clusterId: entityToCluster[e.id] ?? (orphanSet.has(e.id) ? null : null),
    }))

    const response: GraphOverviewResponse = {
      clusters: ranked,
      orphanCount: orphanIds.length,
      entityIndex,
    }
    return NextResponse.json(response)
  } catch (error) {
    console.error("Graph API error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
