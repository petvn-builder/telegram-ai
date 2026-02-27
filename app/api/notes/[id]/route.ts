import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import type { NoteDetail } from "@/app/notes/types"

// Shared entity upsert + link helper
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
      const { data: existing } = await db.from("entities")
        .select("id").eq("user_id", userId).eq("name", name).maybeSingle()
      let entityId: string
      const structuredData = {
        attributes: entity.attributes || {},
        events: entity.events || [],
        relationships: entity.relationships || [],
        responsibilities: entity.responsibilities || [],
      }
      if (existing) {
        entityId = existing.id
        await db.from("entities").update({ ...structuredData, summary_updated_at: null }).eq("id", entityId)
      } else {
        const { data: newEntity } = await db.from("entities")
          .insert({ user_id: userId, name, type, ...structuredData, summary: null, summary_updated_at: null })
          .select("id").single()
        if (!newEntity) continue
        entityId = newEntity.id
      }
      await db.from("knowledge_links").insert({ user_id: userId, knowledge_id: knowledgeId, entity_id: entityId })
      saved.push({ id: entityId, name, type })
    } catch (err) {
      console.error(`Entity upsert error (${name}):`, err)
    }
  }
  return saved
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authClient = await getSupabaseServer()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const db = getSupabaseAdmin()

    const { data: note, error: noteError } = await db
      .from("knowledge")
      .select("id, content, created_at")
      .eq("id", id)
      .single()

    if (noteError || !note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 })
    }

    const { data: links, error: linkError } = await db
      .from("knowledge_links")
      .select("entity_id")
      .eq("knowledge_id", id)

    if (linkError) throw linkError

    const entityIds = links?.map((l) => l.entity_id) ?? []

    let entities: { id: string; name: string; type: string }[] = []
    if (entityIds.length > 0) {
      const { data, error: entityError } = await db
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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    const { data: knowledge, error: updateError } = await db
      .from("knowledge")
      .update({ content, embedding })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, content, created_at")
      .single()

    if (updateError || !knowledge) {
      console.error("Knowledge update error:", updateError)
      return NextResponse.json({ error: "Update failed" }, { status: 500 })
    }

    // Delete old links then re-extract
    await db.from("knowledge_links").delete().eq("knowledge_id", id)

    const rawEntities = await extractEntities(content)
    const entities = await upsertEntitiesAndLink(
      db, user.id, id, Array.isArray(rawEntities) ? rawEntities : []
    )

    return NextResponse.json({
      id: knowledge.id,
      content: knowledge.content,
      created_at: knowledge.created_at,
      entities,
    })
  } catch (error) {
    console.error("Note PUT error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
