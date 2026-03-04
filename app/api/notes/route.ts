import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import type { NoteWithEntities, Entity, Space, Tag } from "@/app/notes/types"

// ── Space token parsing ───────────────────────────────────────────────────────

export function extractSpaceTokens(content: string): { spaceNames: string[]; cleanContent: string } {
  const spaceNames: string[] = []
  const cleanContent = content
    .replace(/(^|\s)@([a-zA-Z0-9_-]+)/g, (_, prefix: string, name: string) => {
      spaceNames.push(name.toLowerCase())
      return prefix
    })
    .replace(/[ \t]+/g, " ")
    .trim()
  return { spaceNames: [...new Set(spaceNames)], cleanContent }
}

// ── Sync note ↔ spaces ────────────────────────────────────────────────────────

export async function syncNoteSpaces(
  db: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  noteId: string,
  spaceNames: string[]
): Promise<Space[]> {
  if (spaceNames.length === 0) {
    // Remove all space links for this note
    await db.from("note_spaces").delete().eq("note_id", noteId)
    return []
  }

  // Upsert each space, collect IDs
  const spaceIds: string[] = []
  const spaceResults: Space[] = []

  for (const name of spaceNames) {
    const { data } = await db
      .from("spaces")
      .upsert({ user_id: userId, name }, { onConflict: "user_id,name" })
      .select("id, name")
      .single()

    if (data) {
      spaceIds.push(data.id)
      spaceResults.push({ id: data.id, name: data.name, note_count: 0 })
    }
  }

  // Replace note's space links
  await db.from("note_spaces").delete().eq("note_id", noteId)

  if (spaceIds.length > 0) {
    await db.from("note_spaces").insert(
      spaceIds.map((space_id) => ({ note_id: noteId, space_id }))
    )
  }

  return spaceResults
}

// ── Tag token parsing ─────────────────────────────────────────────────────────

export function extractTagTokens(content: string): { tagNames: string[]; cleanContent: string } {
  const tagNames: string[] = []
  const cleanContent = content
    .replace(/(^|\s)#([a-zA-Z0-9_-]+)/g, (_, prefix: string, name: string) => {
      tagNames.push(name.toLowerCase())
      return prefix
    })
    .replace(/[ \t]+/g, " ")
    .trim()
  return { tagNames: [...new Set(tagNames)], cleanContent }
}

// ── Sync note ↔ tags ──────────────────────────────────────────────────────────

export async function syncNoteTags(
  db: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  noteId: string,
  tagNames: string[]
): Promise<Tag[]> {
  if (tagNames.length === 0) {
    await db.from("note_tags").delete().eq("note_id", noteId)
    return []
  }

  const tagIds: string[] = []
  const tagResults: Tag[] = []

  for (const name of tagNames) {
    const { data } = await db
      .from("tags")
      .upsert({ user_id: userId, name }, { onConflict: "user_id,name" })
      .select("id, name")
      .single()

    if (data) {
      tagIds.push(data.id)
      tagResults.push({ id: data.id, name: data.name })
    }
  }

  await db.from("note_tags").delete().eq("note_id", noteId)

  if (tagIds.length > 0) {
    await db.from("note_tags").insert(
      tagIds.map((tag_id) => ({ note_id: noteId, tag_id }))
    )
  }

  return tagResults
}

// ── Fetch tags for a set of note IDs ─────────────────────────────────────────

export async function fetchTagsForNotes(
  db: ReturnType<typeof getSupabaseAdmin>,
  noteIds: string[]
): Promise<Map<string, Tag[]>> {
  if (noteIds.length === 0) return new Map()

  const { data: noteTagRows } = await db
    .from("note_tags")
    .select("note_id, tag_id")
    .in("note_id", noteIds)

  if (!noteTagRows || noteTagRows.length === 0) return new Map()

  const uniqueTagIds = [...new Set(noteTagRows.map((r) => r.tag_id))]

  const { data: tagRows } = await db
    .from("tags")
    .select("id, name")
    .in("id", uniqueTagIds)

  const tagMap = new Map<string, Tag>()
  for (const t of tagRows ?? []) tagMap.set(t.id, { id: t.id, name: t.name })

  const result = new Map<string, Tag[]>()
  for (const r of noteTagRows) {
    const tag = tagMap.get(r.tag_id)
    if (!tag) continue
    if (!result.has(r.note_id)) result.set(r.note_id, [])
    result.get(r.note_id)!.push(tag)
  }

  return result
}

// ── Fetch spaces for a set of note IDs ───────────────────────────────────────

async function fetchSpacesForNotes(
  db: ReturnType<typeof getSupabaseAdmin>,
  noteIds: string[]
): Promise<Map<string, Space[]>> {
  if (noteIds.length === 0) return new Map()

  const { data: noteSpaceRows } = await db
    .from("note_spaces")
    .select("note_id, space_id")
    .in("note_id", noteIds)

  if (!noteSpaceRows || noteSpaceRows.length === 0) return new Map()

  const uniqueSpaceIds = [...new Set(noteSpaceRows.map((r) => r.space_id))]

  const { data: spaceRows } = await db
    .from("spaces")
    .select("id, name")
    .in("id", uniqueSpaceIds)

  const spaceMap = new Map<string, { id: string; name: string }>()
  for (const s of spaceRows ?? []) spaceMap.set(s.id, s)

  // Count notes per space across all notes (for note_count)
  const spaceNoteCount = new Map<string, number>()
  for (const r of noteSpaceRows) {
    spaceNoteCount.set(r.space_id, (spaceNoteCount.get(r.space_id) ?? 0) + 1)
  }

  // Build note_id → spaces[]
  const result = new Map<string, Space[]>()
  for (const r of noteSpaceRows) {
    const space = spaceMap.get(r.space_id)
    if (!space) continue
    if (!result.has(r.note_id)) result.set(r.note_id, [])
    result.get(r.note_id)!.push({
      id: space.id,
      name: space.name,
      note_count: spaceNoteCount.get(r.space_id) ?? 0,
    })
  }

  return result
}

// ── GET /api/notes ─────────────────────────────────────────────────────────

export interface PaginatedNotesResponse {
  notes: NoteWithEntities[]
  total: number
  hasMore: boolean
  offset: number
}

export async function GET(req: NextRequest) {
  try {
    const authClient = await getSupabaseServer()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.id
    const db = getSupabaseAdmin()
    const { searchParams } = new URL(req.url)
    const spaceId = searchParams.get("spaceId")
    const preview = searchParams.get("preview") === "1"
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "30", 10), 100)
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10), 0)

    const empty: PaginatedNotesResponse = { notes: [], total: 0, hasMore: false, offset }

    let allSpaceNoteIds: string[] | null = null

    // If filtering by space, get all note IDs in that space first (for total count)
    if (spaceId) {
      const { data: space } = await db
        .from("spaces")
        .select("id")
        .eq("id", spaceId)
        .eq("user_id", userId)
        .maybeSingle()

      if (!space) return NextResponse.json(empty)

      const { data: nsRows } = await db
        .from("note_spaces")
        .select("note_id")
        .eq("space_id", spaceId)

      allSpaceNoteIds = (nsRows ?? []).map((r) => r.note_id)
      if (allSpaceNoteIds.length === 0) return NextResponse.json(empty)
    }

    let total: number
    let notes: { id: string; content: string; created_at: string }[]

    if (allSpaceNoteIds !== null) {
      // Space-filtered path: paginate the ID list client-side, total is already known
      total = allSpaceNoteIds.length
      const pageIds = allSpaceNoteIds.slice(offset, offset + limit)
      if (pageIds.length === 0) return NextResponse.json({ ...empty, total })

      const { data, error } = await db
        .from("knowledge")
        .select("id, content, created_at")
        .eq("role", "note")
        .eq("user_id", userId)
        .in("id", pageIds)
        .order("created_at", { ascending: false })

      if (error) throw error
      notes = data ?? []
    } else {
      // No filter: use count + range from DB
      const { data, error, count } = await db
        .from("knowledge")
        .select("id, content, created_at", { count: "exact" })
        .eq("role", "note")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw error
      notes = data ?? []
      total = count ?? 0
    }

    if (notes.length === 0) return NextResponse.json({ ...empty, total })

    const fetchedNoteIds = notes.map((n) => n.id)

    // 2. Fetch links + spaces + tags in parallel (all depend only on note IDs)
    const [linksResult, noteSpacesIndex, noteTagsIndex] = await Promise.all([
      db.from("knowledge_links")
        .select("knowledge_id, entity_id")
        .eq("user_id", userId)
        .in("knowledge_id", fetchedNoteIds),
      fetchSpacesForNotes(db, fetchedNoteIds),
      fetchTagsForNotes(db, fetchedNoteIds),
    ])

    if (linksResult.error) throw linksResult.error
    const links = linksResult.data

    const entityIds = [...new Set((links ?? []).map((l) => l.entity_id))]

    // 3. Fetch entities (depends on link results)
    const entityMap = new Map<string, Entity>()
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
      content: preview ? note.content.slice(0, 300) : note.content,
      created_at: note.created_at,
      entities: noteEntityIndex.get(note.id) ?? [],
      spaces: noteSpacesIndex.get(note.id) ?? [],
      tags: noteTagsIndex.get(note.id) ?? [],
    }))

    const response: PaginatedNotesResponse = {
      notes: result,
      total,
      hasMore: offset + result.length < total,
      offset,
    }

    return NextResponse.json(response)
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
    const rawContent = (body.content ?? "").trim()
    if (!rawContent) return NextResponse.json({ error: "Empty content" }, { status: 400 })

    const spaceNames: string[] = Array.isArray(body.spaces) ? body.spaces.map(String) : []

    // Extract #tag names for junction table — store original content unchanged (consistent with PUT)
    const { tagNames } = extractTagTokens(rawContent)
    const content = rawContent

    const db = getSupabaseAdmin()

    // Insert the note immediately — no blocking AI calls
    const { data: knowledge, error: insertError } = await db
      .from("knowledge")
      .insert({ user_id: user.id, content, role: "note" })
      .select("id, content, created_at")
      .single()

    if (insertError || !knowledge) {
      console.error("Knowledge insert error:", insertError)
      return NextResponse.json({ error: "Save failed" }, { status: 500 })
    }

    // Sync spaces + tags immediately (fast, no AI)
    const [spaces, tags] = await Promise.all([
      syncNoteSpaces(db, user.id, knowledge.id, spaceNames),
      syncNoteTags(db, user.id, knowledge.id, tagNames),
    ])

    // Run embedding + entity extraction in background after response is sent
    const backgroundWork = (async () => {
      try {
        const hash = createHash("sha256").update(content).digest("hex")
        const { createEmbedding } = await import("@/lib/embeddings")
        const { extractEntities } = await import("@/lib/extractEntities")
        const [embedding, rawEntities] = await Promise.all([
          createEmbedding(content),
          extractEntities(content),
        ])
        await Promise.all([
          db.from("knowledge").update({ embedding, content_hash: hash }).eq("id", knowledge.id),
          upsertEntitiesAndLink(db, user.id, knowledge.id, Array.isArray(rawEntities) ? rawEntities : []),
        ])
      } catch (err) {
        console.error("Background note processing error:", err)
      }
    })()

    // On Vercel, waitUntil keeps the function alive until background work finishes
    // Falls back to fire-and-forget in other environments
    try {
      const { waitUntil } = await import("@vercel/functions")
      waitUntil(backgroundWork)
    } catch {
      // @vercel/functions not available — background work runs as fire-and-forget
    }

    return NextResponse.json({
      id: knowledge.id,
      content: knowledge.content,
      created_at: knowledge.created_at,
      entities: [],       // populated asynchronously; client polls after ~3s
      spaces,
      tags,
      processing: true,   // signals the client that entities are being extracted
    })
  } catch (error) {
    console.error("Notes POST error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
