import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabase } from "@/lib/supabase"
import type { NoteWithEntities, Entity } from "@/app/notes/types"

export async function GET() {
  try {
    const authClient = await getSupabaseServer()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.id
    const supabase = getSupabase()

    // 1. Fetch all notes for this user
    const { data: notes, error: notesError } = await supabase
      .from("knowledge")
      .select("id, content, created_at")
      .eq("role", "note")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (notesError) throw notesError
    if (!notes || notes.length === 0) return NextResponse.json([])

    const noteIds = notes.map((n) => n.id)

    // 2. Fetch all links for those notes
    const { data: links, error: linksError } = await supabase
      .from("knowledge_links")
      .select("knowledge_id, entity_id")
      .eq("user_id", userId)
      .in("knowledge_id", noteIds)

    if (linksError) throw linksError

    const entityIds = [...new Set((links ?? []).map((l) => l.entity_id))]

    // 3. Fetch entities (skip if none)
    let entityMap = new Map<string, Entity>()
    if (entityIds.length > 0) {
      const { data: entities, error: entitiesError } = await supabase
        .from("entities")
        .select("id, name, type")
        .in("id", entityIds)

      if (entitiesError) throw entitiesError
      for (const e of entities ?? []) {
        entityMap.set(e.id, e)
      }
    }

    // 4. Build note → entity index
    const noteEntityIndex = new Map<string, Entity[]>()
    for (const link of links ?? []) {
      const entity = entityMap.get(link.entity_id)
      if (!entity) continue
      if (!noteEntityIndex.has(link.knowledge_id)) {
        noteEntityIndex.set(link.knowledge_id, [])
      }
      noteEntityIndex.get(link.knowledge_id)!.push(entity)
    }

    // 5. Assemble response
    const result: NoteWithEntities[] = notes.map((note) => ({
      id: note.id,
      content: note.content,
      created_at: note.created_at,
      entities: noteEntityIndex.get(note.id) ?? [],
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error("Notes API error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
