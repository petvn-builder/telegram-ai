import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { createEmbedding } from "@/lib/embeddings"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RawEntity {
  name: string
  type: string
  aliases: string[]
  attributes: {
    role: string | null
    organization: string | null
  }
  events: Array<{ type: string; datetime: string; description: string }>
  relationships: Array<{ type: string; target: string; target_role: string | null }>
  responsibilities: string[]
}

export interface SavedEntity {
  id: string
  name: string
  type: string
  aliases: string[]
}

// ── Merge helpers (pure functions) ────────────────────────────────────────────

/**
 * Merge two attributes objects. Incoming non-null values win; existing values
 * are preserved when incoming is null/undefined/empty.
 * Prevents "Alice is PM at Acme" → next note wipes role to null.
 */
function mergeAttributes(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...existing }
  for (const key of Object.keys(incoming)) {
    const val = incoming[key]
    if (val !== null && val !== undefined && val !== "") {
      result[key] = val
    }
  }
  return result
}

/**
 * Union-merge two object arrays, deduplicating by a composite key.
 * Existing items appear first; new items are appended only if not already present.
 * - events: keyFields = ["datetime", "description"]
 * - relationships: keyFields = ["type", "target"]
 */
function mergeObjectArrays<T extends Record<string, unknown>>(
  existing: T[],
  incoming: T[],
  keyFields: (keyof T)[]
): T[] {
  const existingKeys = new Set(
    existing.map((item) => keyFields.map((f) => String(item[f])).join("||"))
  )
  const toAdd = incoming.filter(
    (item) => !existingKeys.has(keyFields.map((f) => String(item[f])).join("||"))
  )
  return [...existing, ...toAdd]
}

/**
 * Union-merge two string arrays, deduplicating case-insensitively.
 * Used for responsibilities[].
 */
function mergeStringArrays(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map((s) => s.toLowerCase()))
  const toAdd = incoming.filter((s) => !seen.has(s.toLowerCase()))
  return [...existing, ...toAdd]
}

/**
 * Returns true if the merged structured data differs from what is stored —
 * i.e., the summary cache should be invalidated.
 * Only invalidates when something actually changed, preventing unnecessary
 * summary regeneration on every note touch.
 */
function hasStructuredDataChanged(
  stored: {
    attributes: Record<string, unknown>
    events: unknown[]
    relationships: unknown[]
    responsibilities: string[]
  },
  merged: {
    attributes: Record<string, unknown>
    events: unknown[]
    relationships: unknown[]
    responsibilities: string[]
  }
): boolean {
  if (
    stored.events.length !== merged.events.length ||
    stored.relationships.length !== merged.relationships.length ||
    stored.responsibilities.length !== merged.responsibilities.length
  ) {
    return true
  }
  return JSON.stringify(stored) !== JSON.stringify(merged)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Upserts extracted entities into the `entities` table with smart merging,
 * then creates links in `knowledge_links`.
 *
 * Fixes vs the old inline versions:
 *   - Entity names are lowercased (case-insensitive dedup: "Alice" == "alice")
 *   - Structured data is MERGED, not overwritten (no data loss from prior notes)
 *   - summary_updated_at is only nulled if data actually changed
 *   - knowledge_links insert uses ignoreDuplicates (safe if entity extracted twice)
 */
export async function upsertEntitiesAndLink(
  db: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  knowledgeId: string,
  rawEntities: RawEntity[]
): Promise<SavedEntity[]> {
  const saved: SavedEntity[] = []

  for (const entity of rawEntities) {
    const name = entity.name?.trim().toLowerCase()
    const type = entity.type?.trim()
    if (!name || !type) continue

    try {
      const incomingAliases = (entity.aliases ?? []).map((a: string) => a.trim().toLowerCase()).filter(Boolean)

      const incoming = {
        attributes: (entity.attributes ?? {}) as Record<string, unknown>,
        events: (entity.events ?? []) as Record<string, unknown>[],
        relationships: (entity.relationships ?? []) as Record<string, unknown>[],
        responsibilities: entity.responsibilities ?? [],
      }

      const { data: existing } = await db
        .from("entities")
        .select("id, name, type, aliases, attributes, events, relationships, responsibilities")
        .eq("user_id", userId)
        .eq("name", name)
        .maybeSingle()

      let entityId: string
      let mergedAliases: string[]

      if (existing) {
        entityId = existing.id

        const storedAttributes = (existing.attributes ?? {}) as Record<string, unknown>
        const storedEvents = (existing.events ?? []) as Record<string, unknown>[]
        const storedRelationships = (existing.relationships ?? []) as Record<string, unknown>[]
        const storedResponsibilities = (existing.responsibilities ?? []) as string[]
        const storedAliases = (existing.aliases ?? []) as string[]

        const mergedAttributes = mergeAttributes(storedAttributes, incoming.attributes)
        const mergedEvents = mergeObjectArrays(
          storedEvents,
          incoming.events as Record<string, unknown>[],
          ["datetime", "description"]
        )
        const mergedRelationships = mergeObjectArrays(
          storedRelationships,
          incoming.relationships as Record<string, unknown>[],
          ["type", "target"]
        )
        const mergedResponsibilities = mergeStringArrays(
          storedResponsibilities,
          incoming.responsibilities
        )
        mergedAliases = mergeStringArrays(storedAliases, incomingAliases)

        const mergedData = {
          attributes: mergedAttributes,
          events: mergedEvents,
          relationships: mergedRelationships,
          responsibilities: mergedResponsibilities,
        }

        const dataChanged = hasStructuredDataChanged(
          {
            attributes: storedAttributes,
            events: storedEvents,
            relationships: storedRelationships,
            responsibilities: storedResponsibilities,
          },
          mergedData
        )

        await db
          .from("entities")
          .update({
            ...mergedData,
            aliases: mergedAliases,
            ...(dataChanged ? { summary_updated_at: null } : {}),
          })
          .eq("id", entityId)
      } else {
        mergedAliases = incomingAliases

        const { data: newEntity } = await db
          .from("entities")
          .insert({
            user_id: userId,
            name,
            type,
            aliases: mergedAliases,
            attributes: incoming.attributes,
            events: incoming.events,
            relationships: incoming.relationships,
            responsibilities: incoming.responsibilities,
            summary: null,
            summary_updated_at: null,
          })
          .select("id")
          .single()

        if (!newEntity) continue
        entityId = newEntity.id
      }

      // Generate and store entity embedding (name + type + aliases)
      try {
        const embeddingText = [name, type, ...mergedAliases].join(", ")
        const embedding = await createEmbedding(embeddingText)
        await db.from("entities").update({ embedding }).eq("id", entityId)
      } catch (embErr) {
        console.error(`[upsertEntitiesAndLink] Embedding error (${name}):`, embErr)
      }

      // Conflict-safe: no error if same entity extracted twice from one note
      await db.from("knowledge_links").upsert(
        { user_id: userId, knowledge_id: knowledgeId, entity_id: entityId },
        { onConflict: "knowledge_id,entity_id", ignoreDuplicates: true }
      )

      saved.push({ id: entityId, name, type, aliases: mergedAliases })
    } catch (err) {
      console.error(`[upsertEntitiesAndLink] Entity error (${name}):`, err)
    }
  }

  return saved
}
