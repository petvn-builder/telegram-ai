import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import type { NoteDetail } from "@/app/notes/types"
import { syncNoteSpaces, extractTagTokens, syncNoteTags } from "@/app/api/notes/route"

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

    // Fetch note and its links in parallel
    const [noteRes, linksRes] = await Promise.all([
      db.from("knowledge")
        .select("id, content, created_at")
        .eq("id", id)
        .single(),
      db.from("knowledge_links")
        .select("entity_id")
        .eq("knowledge_id", id),
    ])

    if (noteRes.error || !noteRes.data) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 })
    }
    if (linksRes.error) throw linksRes.error

    const note = noteRes.data
    const entityIds = linksRes.data?.map((l) => l.entity_id) ?? []

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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authClient = await getSupabaseServer()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const db = getSupabaseAdmin()
    await db.from("knowledge_links").delete().eq("knowledge_id", id).eq("user_id", user.id)
    // note_spaces rows removed via CASCADE on knowledge(id)
    const { error: deleteError } = await db
      .from("knowledge")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (deleteError) {
      console.error("Note delete error:", deleteError)
      return NextResponse.json({ error: "Delete failed" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Note DELETE error:", error)
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
    const rawContent = (body.content ?? "").trim()
    if (!rawContent) return NextResponse.json({ error: "Empty content" }, { status: 400 })

    const spaceNames: string[] = Array.isArray(body.spaces) ? body.spaces.map(String) : []

    // Extract #tag tokens and strip from stored content
    const { tagNames, cleanContent: contentAfterTags } = extractTagTokens(rawContent)
    const content = contentAfterTags

    const db = getSupabaseAdmin()

    // Update note content immediately — no blocking AI calls
    const { data: knowledge, error: updateError } = await db
      .from("knowledge")
      .update({ content })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, content, created_at")
      .single()

    if (updateError || !knowledge) {
      console.error("Knowledge update error:", updateError)
      return NextResponse.json({ error: "Update failed" }, { status: 500 })
    }

    // Sync spaces + tags immediately (fast, no AI)
    const [spaces, tags] = await Promise.all([
      syncNoteSpaces(db, user.id, id, spaceNames),
      syncNoteTags(db, user.id, id, tagNames),
    ])

    // Re-extract entities in background after response is sent
    const backgroundWork = (async () => {
      try {
        const { createEmbedding } = await import("@/lib/embeddings")
        const { extractEntities } = await import("@/lib/extractEntities")
        const [embedding, rawEntities] = await Promise.all([
          createEmbedding(content),
          extractEntities(content),
        ])
        await db.from("knowledge_links").delete().eq("knowledge_id", id)
        await Promise.all([
          db.from("knowledge").update({ embedding }).eq("id", id),
          upsertEntitiesAndLink(db, user.id, id, Array.isArray(rawEntities) ? rawEntities : []),
        ])
      } catch (err) {
        console.error("Background note update processing error:", err)
      }
    })()

    try {
      const { waitUntil } = await import("@vercel/functions")
      waitUntil(backgroundWork)
    } catch {
      // @vercel/functions not available
    }

    return NextResponse.json({
      id: knowledge.id,
      content: knowledge.content,
      created_at: knowledge.created_at,
      entities: [],
      spaces,
      tags,
      processing: true,
    })
  } catch (error) {
    console.error("Note PUT error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
