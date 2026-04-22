import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { createEmbedding } from "@/lib/embeddings"

const EMBEDDING_THRESHOLD = 0.75

export type MatchType = "exact_name" | "exact_alias" | "substring_name" | "substring_alias" | "embedding"

export interface ResolvedEntity {
  id: string
  name: string
  type: string
  aliases: string[]
  matchType: MatchType
  similarity?: number
}

const MATCH_PRIORITY: Record<MatchType, number> = {
  exact_name: 0,
  exact_alias: 1,
  substring_name: 2,
  substring_alias: 3,
  embedding: 4,
}

/**
 * Resolve entity references in a query string.
 *
 * Pipeline:
 *   1. Alias matching (name + aliases, case-insensitive)
 *      Priority: exact_name > exact_alias > substring_name > substring_alias
 *   2. If nothing found → embedding similarity search via match_entities RPC
 *
 * Returns resolved entities sorted by match priority (best match first).
 */
export async function resolveEntities(
  userId: string,
  query: string,
  options?: { maxEntities?: number; embeddingThreshold?: number }
): Promise<ResolvedEntity[]> {
  const maxEntities = options?.maxEntities ?? 5
  const embeddingThreshold = options?.embeddingThreshold ?? EMBEDDING_THRESHOLD
  const db = getSupabaseAdmin()

  const normalizedQuery = query.toLowerCase().trim()

  // ── Step 1: Fetch all entities ──────────────────────────────────────────────

  const { data: entities } = await db
    .from("entities")
    .select("id, name, type, aliases")
    .eq("user_id", userId)

  if (!entities?.length) {
    console.log(`[ENTITY RESOLUTION] Query: "${query}"\n[ENTITY RESOLUTION] No entities found for user`)
    return []
  }

  // ── Step 2: Alias matching ──────────────────────────────────────────────────

  const matched: ResolvedEntity[] = []

  for (const entity of entities) {
    if (!entity.name) continue

    const entityName = entity.name.toLowerCase().trim()
    const aliases: string[] = (entity.aliases ?? []).map((a: string) => a.toLowerCase().trim()).filter(Boolean)

    let matchType: MatchType | null = null
    let matchedAlias: string | null = null

    if (normalizedQuery === entityName) {
      matchType = "exact_name"
    } else if (aliases.some((a) => normalizedQuery === a)) {
      matchType = "exact_alias"
      matchedAlias = aliases.find((a) => normalizedQuery === a) ?? null
    } else if (normalizedQuery.includes(entityName)) {
      matchType = "substring_name"
    } else {
      const aliasHit = aliases.find((a) => a.length >= 2 && normalizedQuery.includes(a))
      if (aliasHit) {
        matchType = "substring_alias"
        matchedAlias = aliasHit
      }
    }

    if (matchType) {
      const logDetail = matchedAlias ? ` via ${matchType} "${matchedAlias}"` : ` via ${matchType}`
      console.log(`[ENTITY RESOLUTION] Query: "${query}"\n[ENTITY RESOLUTION] Alias match: "${entity.name}"${logDetail}`)
      matched.push({
        id: entity.id,
        name: entity.name,
        type: entity.type,
        aliases: entity.aliases ?? [],
        matchType,
      })
    }
  }

  if (matched.length > 0) {
    // Sort by priority (exact first) and cap
    matched.sort((a, b) => MATCH_PRIORITY[a.matchType] - MATCH_PRIORITY[b.matchType])
    return matched.slice(0, maxEntities)
  }

  // ── Step 3: Embedding fallback ──────────────────────────────────────────────

  console.log(`[ENTITY RESOLUTION] Query: "${query}"\n[ENTITY RESOLUTION] No alias match found — trying embedding search`)

  try {
    const queryEmbedding = await createEmbedding(query)

    const { data: embeddingMatches, error: rpcError } = await db.rpc("match_entities", {
      query_embedding: queryEmbedding,
      match_user: userId,
      match_count: maxEntities,
      similarity_threshold: embeddingThreshold,
    })
    if (rpcError) {
      console.error("[ENTITY RESOLUTION] match_entities RPC error:", rpcError)
    }

    if (!embeddingMatches?.length) {
      console.log(`[ENTITY RESOLUTION] Query: "${query}"\n[ENTITY RESOLUTION] No embedding match found`)
      return []
    }

    const results: ResolvedEntity[] = embeddingMatches.map((e: {
      id: string; name: string; type: string; aliases: string[]; similarity: number
    }) => {
      console.log(`[ENTITY RESOLUTION] Embedding match: "${e.name}" score=${e.similarity.toFixed(2)}`)
      return {
        id: e.id,
        name: e.name,
        type: e.type,
        aliases: e.aliases ?? [],
        matchType: "embedding" as MatchType,
        similarity: e.similarity,
      }
    })

    return results
  } catch (err) {
    console.error("[ENTITY RESOLUTION] Embedding search error:", err)
    return []
  }
}
