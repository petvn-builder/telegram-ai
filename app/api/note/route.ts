import { NextRequest, NextResponse } from "next/server"
import { getSupabase } from "@/lib/supabase"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json(
        { error: "Missing note id" },
        { status: 400 }
      )
    }

    const supabase = getSupabase()

    // 1️⃣ Get note content
    const { data: note, error: noteError } = await supabase
      .from("knowledge")
      .select("id, content, created_at")
      .eq("id", id)
      .single()

    if (noteError || !note) {
      return NextResponse.json(
        { error: "Note not found" },
        { status: 404 }
      )
    }

    // 2️⃣ Get related entity IDs
    const { data: links, error: linkError } = await supabase
      .from("knowledge_links")
      .select("entity_id")
      .eq("knowledge_id", id)

    if (linkError) throw linkError

    const entityIds = links?.map(l => l.entity_id) || []

    // 3️⃣ Fetch related entities
    const { data: entities, error: entityError } = await supabase
      .from("entities")
      .select("id, name, type")
      .in("id", entityIds)

    if (entityError) throw entityError

    // 4️⃣ Return structured response
    return NextResponse.json({
      id: note.id,
      content: note.content,
      createdAt: note.created_at,
      relatedEntities: entities || []
    })

  } catch (error) {
    console.error("Note API error:", error)
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    )
  }
}
