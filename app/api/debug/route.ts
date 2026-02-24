import { NextRequest, NextResponse } from "next/server"
import { getSupabase } from "@/lib/supabase"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get("userId") || "1264094635"

    const supabase = getSupabase()

    // Get all entities for user
    const { data: entities, error: entError } = await supabase
      .from("entities")
      .select("id, name, type, created_at, summary, summary_updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5)

    if (entError) throw entError

    // Get all knowledge for user
    const { data: knowledge, error: knowError } = await supabase
      .from("knowledge")
      .select("id, content, created_at, role")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5)

    if (knowError) throw knowError

    // Get all links
    const { data: links, error: linkError } = await supabase
      .from("knowledge_links")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10)

    if (linkError) throw linkError

    return NextResponse.json({
      user_id: userId,
      entities_count: entities?.length || 0,
      knowledge_count: knowledge?.length || 0,
      links_count: links?.length || 0,
      recent_entities: entities || [],
      recent_knowledge: knowledge || [],
      recent_links: links || []
    })

  } catch (error) {
    console.error("Debug API error:", error)
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    )
  }
}
