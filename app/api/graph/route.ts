import { NextRequest, NextResponse } from "next/server"
import { getSupabase } from "@/lib/supabase"
import { buildGraph } from "@/lib/graph/buildGraph"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get("userId")

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400 }
      )
    }
    
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

    const graph = buildGraph(
         entities || [],
        links || [],
        notes || []
        )

    return NextResponse.json(graph)

  } catch (error) {
    console.error("Graph API error:", error)
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    )
  }
}
