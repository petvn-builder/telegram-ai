import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import type { NoteDetail } from "@/app/notes/types"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await getSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: note, error: noteError } = await supabase
      .from("knowledge")
      .select("id, content, created_at")
      .eq("id", id)
      .single()

    if (noteError || !note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 })
    }

    const { data: links, error: linkError } = await supabase
      .from("knowledge_links")
      .select("entity_id")
      .eq("knowledge_id", id)

    if (linkError) throw linkError

    const entityIds = links?.map((l) => l.entity_id) ?? []

    let entities: { id: string; name: string; type: string }[] = []
    if (entityIds.length > 0) {
      const { data, error: entityError } = await supabase
        .from("entities")
        .select("id, name, type")
        .in("id", entityIds)

      if (entityError) throw entityError
      entities = data ?? []
    }

    const result: NoteDetail = {
      id: note.id,
      content: note.content,
      created_at: note.created_at,
      relatedEntities: entities,
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Note detail API error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
