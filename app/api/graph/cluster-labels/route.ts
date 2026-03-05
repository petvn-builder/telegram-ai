import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { askOpenAI } from "@/lib/openai"

type ClusterInput = {
  id: string
  entity_ids: string[]
}

export async function POST(req: NextRequest) {
  try {
    const authClient = await getSupabaseServer()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const clusters: ClusterInput[] = body?.clusters ?? []
    if (clusters.length === 0) return NextResponse.json({ labels: [] })

    const db = getSupabaseAdmin()
    const allEntityIds = [...new Set(clusters.flatMap((c) => c.entity_ids))]

    const { data: entities } = await db
      .from("entities")
      .select("id, name, type")
      .in("id", allEntityIds)
      .eq("user_id", user.id)

    const entityMap: Record<string, { name: string; type: string }> = {}
    for (const e of entities ?? []) entityMap[e.id] = { name: e.name, type: e.type }

    const clusterDescriptions = clusters.map((c) => {
      const names = c.entity_ids
        .map((id) => entityMap[id]?.name ?? id)
        .filter(Boolean)
        .join(", ")
      return `Cluster ${c.id}: ${names}`
    })

    const prompt = `You are labeling groups of related concepts in a personal knowledge graph.

For each cluster below, provide a short 2-4 word label that captures the common theme.

${clusterDescriptions.join("\n")}

Return ONLY valid JSON in this format:
{
  "labels": [
    { "id": "cluster-id", "label": "Short Theme Label" }
  ]
}

One entry per cluster. Labels should be concise and meaningful (e.g., "Work Projects", "Health & Fitness", "Personal Relationships").`

    const raw = await askOpenAI("", prompt)
    if (!raw) return NextResponse.json({ labels: [] })

    let labels: { id: string; label: string }[] = []
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.labels)) {
        labels = parsed.labels.filter((l: any) => l?.id && l?.label)
      }
    } catch {
      // non-JSON response — return empty
    }

    return NextResponse.json({ labels })
  } catch (error) {
    console.error("Cluster labels error:", error)
    return NextResponse.json({ labels: [] })
  }
}
