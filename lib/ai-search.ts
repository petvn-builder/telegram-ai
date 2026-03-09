import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { createEmbedding } from "@/lib/embeddings"
import { askOpenAI } from "@/lib/openai"

const SIMILARITY_THRESHOLD = 0.75
const MAX_MEMORY_CHARS = 2000
const MAX_ENTITIES = 5

/**
 * Two-tier entity-aware semantic search over a user's knowledge base.
 * Tier 1: match entity names in the question, inject linked notes as entity context.
 * Tier 2: vector similarity search, filtered by entity relevance gate.
 * Returns the AI's answer.
 */
export async function semanticSearch(userId: string, question: string): Promise<string> {
  const db = getSupabaseAdmin()

  let graphMemory = ""
  let memory = ""

  // ── Tier 1: Entity context ──────────────────────────────────────────────────

  const { data: possibleEntities } = await db
    .from("entities")
    .select("*")
    .eq("user_id", userId)

  const normalizedQuestion = question.toLowerCase().trim()
  let injectedEntities = 0
  const matchedEntityIds = new Set<string>()
  const matchedEntityNames = new Set<string>()
  const entityLinkedNoteIds = new Set<string>()
  const allMatchedEntityNoteIds = new Set<string>()

  for (const entity of possibleEntities ?? []) {
    if (!entity.name) continue

    const normalizedName = entity.name.toLowerCase().trim()

    if (normalizedQuestion.includes(normalizedName) && injectedEntities < MAX_ENTITIES) {
      matchedEntityIds.add(entity.id)
      matchedEntityNames.add(normalizedName)

      graphMemory += `${entity.name} (${entity.type})\n`

      const { data: links } = await db
        .from("knowledge_links")
        .select("knowledge_id")
        .eq("entity_id", entity.id)

      const knowledgeIds = (links ?? []).map((l: { knowledge_id: string }) => l.knowledge_id)

      for (const id of knowledgeIds) allMatchedEntityNoteIds.add(id)

      if (knowledgeIds.length > 0) {
        const { data: notes } = await db
          .from("knowledge")
          .select("id, content")
          .in("id", knowledgeIds)
          .order("created_at", { ascending: false })
          .limit(5)

        const fetchedNotes = notes ?? []
        if (fetchedNotes.length > 0) {
          for (const note of fetchedNotes) {
            entityLinkedNoteIds.add(note.id)
            graphMemory += `  - ${note.content}\n`
          }
        } else if (entity.summary) {
          graphMemory += `Summary: ${entity.summary}\n`
        }
      } else if (entity.summary) {
        graphMemory += `Summary: ${entity.summary}\n`
      }

      graphMemory += "\n"
      injectedEntities++
    }
  }

  // ── Tier 2: Semantic search ─────────────────────────────────────────────────

  const queryEmbedding = await createEmbedding(question)

  const { data: memories } = await db.rpc("match_knowledge", {
    query_embedding: queryEmbedding,
    match_user: userId,
    match_count: 8,
  })

  const uniqueContents = new Set<string>()
  const normalizedCurrentMessage = question.trim().toLowerCase()

  for (const item of memories ?? []) {
    if (!item?.content) continue
    if (item.role === "ai" || item.role === "user") continue

    const normalizedItem = item.content.trim().toLowerCase()
    if (normalizedItem === normalizedCurrentMessage) continue
    if (item.id && entityLinkedNoteIds.has(item.id)) continue

    if (matchedEntityIds.size > 0) {
      const isEntityLinked = item.id && allMatchedEntityNoteIds.has(item.id)
      if (!isEntityLinked) {
        const mentionsEntity =
          matchedEntityNames.size > 0 &&
          [...matchedEntityNames].some(
            (name) => name.length >= 3 && item.content.toLowerCase().includes(name)
          )
        if (!mentionsEntity) continue
        if (item.similarity !== undefined && item.similarity < 0.70) continue
      }
    } else {
      if (item.similarity !== undefined && item.similarity < SIMILARITY_THRESHOLD) continue
    }

    if (uniqueContents.has(normalizedItem)) continue
    uniqueContents.add(normalizedItem)

    memory += `[${item.role}] ${item.content}\n`
    if (memory.length > MAX_MEMORY_CHARS) break
  }

  // ── Build combined memory and call AI ──────────────────────────────────────

  let combinedMemory = ""
  if (graphMemory.trim()) {
    combinedMemory += "=== ENTITY CONTEXT ===\n" + graphMemory.trim() + "\n\n"
  }
  if (memory.trim()) {
    combinedMemory += "=== RELEVANT MEMORY ===\n" + memory.trim()
  }

  const aiResponse = await askOpenAI(combinedMemory, question)
  return aiResponse ?? "I couldn't find an answer based on your notes."
}
