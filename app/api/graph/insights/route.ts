import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { askOpenAI } from "@/lib/openai"

export type InsightType =
  | "hidden_connection"
  | "knowledge_gap"
  | "trending_topic"
  | "orphan_alert"
  | "timeline_conflict"

export type Insight = {
  id: string
  type: InsightType
  title: string
  description: string
  entity_ids: string[]
  suggested_action: "create_note" | "link_entities" | "none"
}

export async function GET() {
  try {
    const authClient = await getSupabaseServer()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const db = getSupabaseAdmin()
    const userId = user.id

    const [entitiesRes, linksRes, notesRes] = await Promise.all([
      db
        .from("entities")
        .select("id, name, type, mentionCount:knowledge_links(count)")
        .eq("user_id", userId)
        .limit(50),
      db
        .from("knowledge_links")
        .select("entity_id, knowledge_id")
        .eq("user_id", userId),
      db
        .from("knowledge")
        .select("id, content")
        .eq("user_id", userId)
        .eq("role", "note")
        .order("created_at", { ascending: false })
        .limit(50),
    ])

    const entities = entitiesRes.data ?? []
    const links = linksRes.data ?? []
    const notes = notesRes.data ?? []

    // Build entity mention counts
    const mentionCounts: Record<string, number> = {}
    for (const link of links) {
      mentionCounts[link.entity_id] = (mentionCounts[link.entity_id] || 0) + 1
    }

    // Build entity-to-notes map for connections
    const entityToNotes: Record<string, Set<string>> = {}
    for (const link of links) {
      if (!entityToNotes[link.entity_id]) entityToNotes[link.entity_id] = new Set()
      entityToNotes[link.entity_id].add(link.knowledge_id)
    }

    // Compact entity list
    const entityContext = entities
      .map((e) => `- ${e.name} (${e.type}, ${mentionCounts[e.id] || 0} mentions)`)
      .join("\n")

    // Compact note excerpts
    const noteContext = notes
      .map((n) => `- ${n.content.slice(0, 200).replace(/\n/g, " ")}`)
      .join("\n")

    const prompt = `You are analyzing a personal knowledge graph. Below is a summary of the user's entities and recent notes.

ENTITIES (name, type, mention count):
${entityContext || "(none)"}

RECENT NOTES (excerpts):
${noteContext || "(none)"}

Generate 3 to 5 insights about this knowledge graph. Return ONLY valid JSON in this exact format:
{
  "insights": [
    {
      "id": "unique-string-id",
      "type": "hidden_connection|knowledge_gap|trending_topic|orphan_alert|timeline_conflict",
      "title": "Short title (max 8 words)",
      "description": "1-2 sentence description of the insight.",
      "entity_ids": [],
      "suggested_action": "create_note|link_entities|none"
    }
  ]
}

Rules:
- entity_ids: include IDs only for entities directly relevant to the insight. Available entity IDs: ${entities.map((e) => e.id).join(", ")}
- hidden_connection: two or more entities that likely relate but aren't directly linked
- knowledge_gap: a topic that appears in notes but has no dedicated entity or is underexplored
- trending_topic: an entity or theme that appears frequently in recent notes
- orphan_alert: an entity with very few (0-1) mentions — at risk of being forgotten
- timeline_conflict: events or dates mentioned in notes that seem inconsistent
- Be specific and actionable. Do not invent facts not implied by the data.`

    const raw = await askOpenAI("", prompt)
    if (!raw) return NextResponse.json({ insights: [] })

    let insights: Insight[] = []
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.insights)) {
        insights = parsed.insights.filter(
          (i: any) =>
            i?.id && i?.type && i?.title && i?.description
        )
      }
    } catch {
      // OpenAI returned non-JSON — graceful empty
    }

    return NextResponse.json({ insights })
  } catch (error) {
    console.error("Graph insights error:", error)
    return NextResponse.json({ insights: [] })
  }
}
