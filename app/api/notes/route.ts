import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import type { NoteWithEntities, Entity } from "@/app/notes/types"

export async function GET() {
  try {
    const authClient = await getSupabaseServer()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.id
    const db = getSupabaseAdmin()

    // 1. Fetch all notes for this user
    const { data: notes, error: notesError } = await db
      .from("knowledge")
      .select("id, content, created_at")
      .eq("role", "note")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (notesError) throw notesError
    if (!notes || notes.length === 0) return NextResponse.json([])

    const noteIds = notes.map((n) => n.id)

    // 2. Fetch all links for those notes
    const { data: links, error: linksError } = await db
      .from("knowledge_links")
      .select("knowledge_id, entity_id")
      .eq("user_id", userId)
      .in("knowledge_id", noteIds)

    if (linksError) throw linksError

    const entityIds = [...new Set((links ?? []).map((l) => l.entity_id))]

    // 3. Fetch entities (skip if none)
    let entityMap = new Map<string, Entity>()
    if (entityIds.length > 0) {
      const { data: entities, error: entitiesError } = await db
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

// ── shared entity upsert + link helper ────────────────────────────────────────

async function upsertEntitiesAndLink(
  db: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  knowledgeId: string,
  rawEntities: any[]
): Promise<{ id: string; name: string; type: string }[]> {
  const saved: { id: string; name: string; type: string }[] = []

  for (const entity of rawEntities) {
    const name = entity.name?.trim()
    const type = entity.type?.trim()
    if (!name || !type) continue

    try {
      const { data: existing } = await db
        .from("entities")
        .select("id")
        .eq("user_id", userId)
        .eq("name", name)
        .maybeSingle()

      let entityId: string
      const structuredData = {
        attributes: entity.attributes || {},
        events: entity.events || [],
        relationships: entity.relationships || [],
        responsibilities: entity.responsibilities || [],
      }

      if (existing) {
        entityId = existing.id
        await db.from("entities")
          .update({ ...structuredData, summary_updated_at: null })
          .eq("id", entityId)
      } else {
        const { data: newEntity } = await db.from("entities")
          .insert({ user_id: userId, name, type, ...structuredData, summary: null, summary_updated_at: null })
          .select("id")
          .single()
        if (!newEntity) continue
        entityId = newEntity.id
      }

      await db.from("knowledge_links").insert({
        user_id: userId,
        knowledge_id: knowledgeId,
        entity_id: entityId,
      })

      saved.push({ id: entityId, name, type })
    } catch (err) {
      console.error(`Entity upsert error (${name}):`, err)
    }
  }

  return saved
}

export async function POST(req: NextRequest) {
  try {
    const authClient = await getSupabaseServer()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const content = (body.content ?? "").trim()
    if (!content) return NextResponse.json({ error: "Empty content" }, { status: 400 })

    const db = getSupabaseAdmin()
    const { createEmbedding } = await import("@/lib/embeddings")
    const { extractEntities } = await import("@/lib/extractEntities")

    const embedding = await createEmbedding(content)

    const { data: knowledge, error: insertError } = await db
      .from("knowledge")
      .insert({ user_id: user.id, content, role: "note", embedding })
      .select("id, content, created_at")
      .single()

    if (insertError || !knowledge) {
      console.error("Knowledge insert error:", insertError)
      return NextResponse.json({ error: "Save failed" }, { status: 500 })
    }

    const rawEntities = await extractEntities(content)
    const entities = await upsertEntitiesAndLink(
      db, user.id, knowledge.id, Array.isArray(rawEntities) ? rawEntities : []
    )

    return NextResponse.json({
      id: knowledge.id,
      content: knowledge.content,
      created_at: knowledge.created_at,
      entities,
    })
  } catch (error) {
    console.error("Notes POST error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
