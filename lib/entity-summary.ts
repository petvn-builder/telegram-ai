import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { askOpenAI } from "@/lib/openai"

const SUMMARY_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

type EntityInput = {
  id: string
  name: string
  type: string
  summary?: string | null
  summary_updated_at?: string | null
}

/**
 * Returns a cached entity summary if fresh, otherwise generates and caches a new one.
 * Safe to call from any server context (API route, cron job).
 */
export async function getOrGenerateSummary(entity: EntityInput): Promise<string | null> {
  const db = getSupabaseAdmin()

  // Return cached summary if within TTL
  const isFresh =
    entity.summary &&
    entity.summary_updated_at &&
    Date.now() - new Date(entity.summary_updated_at).getTime() < SUMMARY_TTL_MS

  if (isFresh) return entity.summary!

  // Fetch all notes linked to this entity
  const { data: links } = await db
    .from("knowledge_links")
    .select("knowledge_id")
    .eq("entity_id", entity.id)

  const knowledgeIds = (links ?? []).map((l) => l.knowledge_id)

  let notesText = ""
  if (knowledgeIds.length > 0) {
    const { data: notes } = await db
      .from("knowledge")
      .select("content")
      .in("id", knowledgeIds)
    notesText = (notes ?? []).map((n) => n.content).join("\n")
  }

  const prompt = `You are generating a structured knowledge summary for a person/project/topic in a personal knowledge graph.

Entity:
Name: ${entity.name}
Type: ${entity.type}

Related Notes:
${notesText || "(No notes yet)"}

Generate a structured summary using exactly this format:

### Short Summary
2-3 sentences describing who/what this entity is and their main role.

### Key Insights
- Key insight 1
- Key insight 2
- Key insight 3 (add more if relevant)

### Important Facts
- Name: ${entity.name}
- Role: (role if known from notes, else omit this line)
- (any other key facts from the notes)

Be concise and factual. Only include facts from the provided notes. Do NOT invent information.`

  const summary = await askOpenAI("", prompt)
  if (!summary) return null

  // Cache to DB
  await db
    .from("entities")
    .update({ summary, summary_updated_at: new Date().toISOString() })
    .eq("id", entity.id)

  return summary
}
