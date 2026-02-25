import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabase } from "@/lib/supabase"
import { buildGraph } from "@/lib/graph/buildGraph"

export async function GET() {
  try {
    const authClient = await getSupabaseServer()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.id
    const supabase = getSupabase()

    const { data: entities, error: entityError } = await supabase
      .from("entities")
      .select("id, name, type")
      .eq("user_id", userId)

    if (entityError) throw entityError

    const { data: links, error: linkError } = await supabase
      .from("knowledge_links")
      .select("knowledge_id, entity_id")
      .eq("user_id", userId)

    if (linkError) throw linkError

    const { data: notes, error: noteError } = await supabase
      .from("knowledge")
      .select("id, content, created_at")
      .eq("user_id", userId)

    if (noteError) throw noteError

    const graph = buildGraph(entities || [], links || [], notes || [])

    return NextResponse.json(graph)
  } catch (error) {
    console.error("Graph API error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
