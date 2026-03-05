import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import type { NoteDetail } from "@/app/notes/types"
import { syncNoteSpaces, extractTagTokens, syncNoteTags } from "@/app/api/notes/route"
import { upsertEntitiesAndLink } from "@/lib/entities"

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

    // 1. Capture which entities are linked so we can clean up orphans below
    const { data: linkedEntities } = await db
      .from("knowledge_links")
      .select("entity_id")
      .eq("knowledge_id", id)
      .eq("user_id", user.id)

    const entityIds = (linkedEntities ?? []).map((r) => r.entity_id)

    // 2. Delete links (DB trigger auto-deletes orphaned entities when deployed)
    await db.from("knowledge_links").delete().eq("knowledge_id", id).eq("user_id", user.id)

    // 3. Delete the note — note_spaces rows removed via CASCADE on knowledge(id)
    const { error: deleteError } = await db
      .from("knowledge")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (deleteError) {
      console.error("Note delete error:", deleteError)
      return NextResponse.json({ error: "Delete failed" }, { status: 500 })
    }

    // 4. Belt-and-suspenders: delete any entities that now have zero links
    //    (covers environments where the DB trigger hasn't been deployed yet)
    if (entityIds.length > 0) {
      const { data: stillLinked } = await db
        .from("knowledge_links")
        .select("entity_id")
        .in("entity_id", entityIds)

      const stillLinkedSet = new Set((stillLinked ?? []).map((r) => r.entity_id))
      const orphanIds = entityIds.filter((eid) => !stillLinkedSet.has(eid))

      if (orphanIds.length > 0) {
        await db.from("entities").delete().in("id", orphanIds)
      }
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
    // extract=false means auto-save: persist content but skip OpenAI extraction
    const shouldExtract: boolean = body.extract !== false

    // Extract #tag names for junction table — store original content unchanged
    const { tagNames } = extractTagTokens(rawContent)
    const content = rawContent

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

    // Re-extract entities in background — only when caller requests it
    if (shouldExtract) {
      const backgroundWork = (async () => {
        try {
          const hash = createHash("sha256").update(content).digest("hex")

          // Skip extraction if content hasn't changed since last extraction
          const { data: row } = await db
            .from("knowledge")
            .select("content_hash")
            .eq("id", id)
            .single()

          if (row?.content_hash === hash) {
            console.log(`[extract] Skipping — content unchanged for note ${id}`)
            return
          }

          const { createEmbedding } = await import("@/lib/embeddings")
          const { extractEntities } = await import("@/lib/extractEntities")

          // Run AI calls BEFORE touching links — minimises the gap where note has no entity links
          const [embedding, rawEntities] = await Promise.all([
            createEmbedding(content),
            extractEntities(content),
          ])

          // Delete old links then re-insert; gap is now ~1 DB round-trip, not the full OAI call duration
          await db.from("knowledge_links").delete().eq("knowledge_id", id)
          await Promise.all([
            db.from("knowledge").update({ embedding, content_hash: hash }).eq("id", id),
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
