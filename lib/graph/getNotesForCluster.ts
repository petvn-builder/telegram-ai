import { getSupabaseAdmin } from "@/lib/supabase/admin"

export type NotePreview = {
  id: string
  content: string
  created_at: string | null
  entityIds: string[]
}

export async function getNotesForCluster(
  userId: string,
  entityIds: string[],
  limit = 50
): Promise<NotePreview[]> {
  if (entityIds.length === 0) return []
  const db = getSupabaseAdmin()

  const memberSet = new Set(entityIds)
  const { data: linkRows, error: linkErr } = await db
    .from("knowledge_links")
    .select("knowledge_id, entity_id")
    .eq("user_id", userId)
    .in("entity_id", entityIds)

  if (linkErr) throw linkErr
  const noteToEntities: Record<string, string[]> = {}
  for (const row of linkRows ?? []) {
    if (!memberSet.has(row.entity_id)) continue
    if (!noteToEntities[row.knowledge_id]) noteToEntities[row.knowledge_id] = []
    noteToEntities[row.knowledge_id].push(row.entity_id)
  }
  const noteIds = Object.keys(noteToEntities)
  if (noteIds.length === 0) return []

  const { data: notes, error: notesErr } = await db
    .from("knowledge")
    .select("id, content, created_at")
    .eq("user_id", userId)
    .eq("role", "note")
    .in("id", noteIds)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (notesErr) throw notesErr
  return (notes ?? []).map((n) => ({
    ...n,
    entityIds: noteToEntities[n.id] ?? [],
  }))
}
