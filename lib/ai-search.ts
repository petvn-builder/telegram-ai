import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { createEmbedding } from "@/lib/embeddings"
import { askOpenAI } from "@/lib/openai"
import { resolveEntities } from "@/lib/entity-resolver"

const SIMILARITY_THRESHOLD = 0.75
const MAX_MEMORY_CHARS = 2000
const MAX_ENTITIES = 5

/**
 * Build the combined knowledge context string (entity context + semantic memory)
 * for a user's query without calling the LLM. Shared by semanticSearch and /pet.
 */
export async function buildKnowledgeContext(userId: string, question: string): Promise<string> {
  const db = getSupabaseAdmin()

  let graphMemory = ""
  let memory = ""

  // ── Tier 1: Entity context ──────────────────────────────────────────────────

  const matchedEntityIds = new Set<string>()
  const matchedEntityNames = new Set<string>()
  const entityLinkedNoteIds = new Set<string>()
  const allMatchedEntityNoteIds = new Set<string>()

  const resolvedEntities = await resolveEntities(userId, question, { maxEntities: MAX_ENTITIES })

  for (const entity of resolvedEntities) {
    matchedEntityIds.add(entity.id)
    matchedEntityNames.add(entity.name.toLowerCase().trim())

    const { data: fullEntity } = await db
      .from("entities")
      .select("summary")
      .eq("id", entity.id)
      .maybeSingle()

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
      } else if (fullEntity?.summary) {
        graphMemory += `Summary: ${fullEntity.summary}\n`
      }
    } else if (fullEntity?.summary) {
      graphMemory += `Summary: ${fullEntity.summary}\n`
    }

    graphMemory += "\n"
  }

  // ── Tier 2: Semantic search ─────────────────────────────────────────────────

  const queryEmbedding = await createEmbedding(question)

  const { data: memories } = await db.rpc("match_knowledge", {
    query_embedding: queryEmbedding,
    match_user: userId,
    match_count: 8,
  })

  console.log(`[WEB AI] Tier 1 (entity-linked): ${entityLinkedNoteIds.size} notes, ${matchedEntityIds.size} entities matched`)
  console.log("---- GRAPH MEMORY BUILT ----")
  console.log(graphMemory || "No graph context injected")
  console.log("----------------------------")

  const uniqueContents = new Set<string>()
  const normalizedCurrentMessage = question.trim().toLowerCase()
  let tier2Count = 0

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
    tier2Count++
    if (memory.length > MAX_MEMORY_CHARS) break
  }

  console.log(`[WEB AI] Tier 2 (semantic, threshold=${SIMILARITY_THRESHOLD}): ${tier2Count} notes added`)
  console.log(`[WEB AI] Final: ${entityLinkedNoteIds.size + tier2Count} notes total`)

  let combinedMemory = ""
  if (graphMemory.trim()) {
    combinedMemory += "=== ENTITY CONTEXT ===\n" + graphMemory.trim() + "\n\n"
  }
  if (memory.trim()) {
    combinedMemory += "=== RELEVANT MEMORY ===\n" + memory.trim()
  }

  return combinedMemory
}

/**
 * Two-tier entity-aware semantic search over a user's knowledge base.
 * Tier 1: match entity names in the question, inject linked notes as entity context.
 * Tier 2: vector similarity search, filtered by entity relevance gate.
 * Returns the AI's answer.
 */
export async function semanticSearch(
  userId: string,
  question: string,
  conversationHistory = ""
): Promise<string> {
  const combinedMemory = await buildKnowledgeContext(userId, question)

  console.log("----- FINAL MEMORY SENT TO OPENAI -----")
  console.log(combinedMemory || "(no memory)")
  console.log("----------------------------------------")

  const aiResponse = await askOpenAI(combinedMemory, question, conversationHistory)
  return aiResponse ?? "I couldn't find an answer based on your notes."
}

/**
 * Fetch the last N user/ai conversation turns for a user from the knowledge table,
 * formatted as a readable history string (oldest → newest).
 */
export async function getRecentConversation(userId: string, limit = 10): Promise<string> {
  const db = getSupabaseAdmin()

  const { data } = await db
    .from("knowledge")
    .select("role, content, created_at")
    .eq("user_id", userId)
    .in("role", ["user", "ai"])
    .order("created_at", { ascending: false })
    .limit(limit)

  if (!data || data.length === 0) return ""

  return [...data]
    .reverse() // oldest → newest
    .map((r) => `${r.role === "user" ? "User" : "Assistant"}: ${r.content}`)
    .join("\n")
}
