import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { buildClusters } from "@/lib/graph/buildClusters"
import { buildEntityGraph, type EntityNode, type EntityEdge } from "@/lib/graph/buildGraph"
import { rankClusters } from "@/lib/graph/clusterRank"
import { getNotesForCluster, type NotePreview } from "@/lib/graph/getNotesForCluster"

export type ClusterDetailResponse = {
  hubEntityId: string
  entities: EntityNode[]
  edges: EntityEdge[]
  notePreviews: NotePreview[]
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: hubId } = await params
    const authClient = await getSupabaseServer()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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

    const allEntities = entitiesRes.data ?? []
    const allLinks = linksRes.data ?? []
    const allNotes = notesRes.data ?? []

    const { clusters } = buildClusters(allEntities, allLinks)
    const ranked = rankClusters(clusters, allEntities, allLinks, allNotes)
    const target = ranked.find((c) => c.hubEntityId === hubId)
    if (!target) return NextResponse.json({ error: "Cluster not found" }, { status: 404 })

    const memberSet = new Set(target.entityIds)
    const memberEntities = allEntities.filter((e) => memberSet.has(e.id))
    const memberLinks = allLinks.filter((l) => memberSet.has(l.entity_id))

    const { nodes, links } = buildEntityGraph(memberEntities, memberLinks)
    const notePreviews = await getNotesForCluster(userId, target.entityIds, 50)

    const response: ClusterDetailResponse = {
      hubEntityId: target.hubEntityId,
      entities: nodes,
      edges: links,
      notePreviews,
    }
    return NextResponse.json(response)
  } catch (error) {
    console.error("Cluster detail error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
