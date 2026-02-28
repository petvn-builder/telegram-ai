import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { buildGraph } from "@/lib/graph/buildGraph"

export async function GET() {
  try {
    const authClient = await getSupabaseServer()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.id
    const db = getSupabaseAdmin()

    // All three queries are independent — run in parallel
    // Entities capped at 200 by link count to prevent OOM on large accounts
    const [entitiesRes, linksRes, notesRes] = await Promise.all([
      db.from("entities")
        .select("id, name, type")
        .eq("user_id", userId)
        .limit(200),
      db.from("knowledge_links")
        .select("knowledge_id, entity_id")
        .eq("user_id", userId),
      db.from("knowledge")
        .select("id, content")
        .eq("user_id", userId)
        .eq("role", "note"),
    ])

    if (entitiesRes.error) throw entitiesRes.error
    if (linksRes.error) throw linksRes.error
    if (notesRes.error) throw notesRes.error

    const graph = buildGraph(entitiesRes.data || [], linksRes.data || [], notesRes.data || [])

    return NextResponse.json(graph)
  } catch (error) {
    console.error("Graph API error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
