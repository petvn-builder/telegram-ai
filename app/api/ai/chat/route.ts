import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { parseTaskText, createTask } from "@/lib/tasks"
import { getOrGenerateSummary } from "@/lib/entity-summary"
import { semanticSearch } from "@/lib/ai-search"
import { upsertEntitiesAndLink } from "@/lib/entities"
import {
  extractSpaceTokens,
  syncNoteSpaces,
  extractTagTokens,
  syncNoteTags,
} from "@/app/api/notes/route"

const COMMANDS = [
  { name: "/save", description: "Save a note to your knowledge base" },
  { name: "/note", description: "Save a note (alias for /save)" },
  { name: "/task", description: "Create a task (supports natural language dates)" },
  { name: "/todo", description: "View your active tasks" },
  { name: "/entity", description: "Explore an entity from your knowledge graph" },
]

export async function POST(req: NextRequest) {
  try {
    const authClient = await getSupabaseServer()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ action: "error", text: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const message: string = (body.message ?? "").trim()
    if (!message) return NextResponse.json({ action: "error", text: "Empty message" }, { status: 400 })

    // ── "/" → command list ──────────────────────────────────────────────────────
    if (message === "/") {
      return NextResponse.json({ action: "commands", commands: COMMANDS })
    }

    const db = getSupabaseAdmin()

    // ── /save or /note <text> ────────────────────────────────────────────────────
    if (/^\/(note|save)\s+/i.test(message)) {
      const rawContent = message.replace(/^\/(note|save)\s+/i, "").trim()
      if (!rawContent) {
        return NextResponse.json({ action: "error", text: "Please provide note content after /save or /note" })
      }

      const { tagNames } = extractTagTokens(rawContent)
      const { spaceNames } = extractSpaceTokens(rawContent)

      const { data: knowledge, error: insertError } = await db
        .from("knowledge")
        .insert({ user_id: user.id, content: rawContent, role: "note" })
        .select("id, content, created_at")
        .single()

      if (insertError || !knowledge) {
        console.error("Note insert error:", insertError)
        return NextResponse.json({ action: "error", text: "Failed to save note." })
      }

      await Promise.all([
        syncNoteSpaces(db, user.id, knowledge.id, spaceNames),
        syncNoteTags(db, user.id, knowledge.id, tagNames),
      ])

      // Background: embedding + entity extraction
      const backgroundWork = (async () => {
        try {
          const hash = createHash("sha256").update(rawContent).digest("hex")
          const { createEmbedding } = await import("@/lib/embeddings")
          const { extractEntities } = await import("@/lib/extractEntities")
          const [embedding, rawEntities] = await Promise.all([
            createEmbedding(rawContent),
            extractEntities(rawContent),
          ])
          await Promise.all([
            db.from("knowledge").update({ embedding, content_hash: hash }).eq("id", knowledge.id),
            upsertEntitiesAndLink(db, user.id, knowledge.id, Array.isArray(rawEntities) ? rawEntities : []),
          ])
        } catch (err) {
          console.error("Background note processing error:", err)
        }
      })()

      try {
        const { waitUntil } = await import("@vercel/functions")
        waitUntil(backgroundWork)
      } catch {
        // fire-and-forget in non-Vercel environments
      }

      return NextResponse.json({ action: "note_created", note: knowledge })
    }

    // ── /task <text> ────────────────────────────────────────────────────────────
    if (/^\/task\s+/i.test(message)) {
      const rawText = message.replace(/^\/task\s+/i, "").trim()
      if (!rawText) {
        return NextResponse.json({ action: "error", text: "Please provide a task description after /task" })
      }

      const parsed = parseTaskText(rawText)
      const task = await createTask(db, user.id, {
        ...parsed,
        status: "inbox",
        created_from: "manual",
      })

      return NextResponse.json({ action: "task_created", task })
    }

    // ── /entity <name> ──────────────────────────────────────────────────────────
    if (/^\/entity\s+/i.test(message)) {
      const entityName = message.replace(/^\/entity\s+/i, "").trim()
      if (!entityName) {
        return NextResponse.json({ action: "error", text: "Please provide an entity name after /entity" })
      }

      const { data: entity } = await db
        .from("entities")
        .select("*")
        .eq("user_id", user.id)
        .ilike("name", entityName)
        .maybeSingle()

      if (!entity) {
        return NextResponse.json({
          action: "answer",
          text: `No entity found matching "${entityName}". Try a different name or check your notes.`,
        })
      }

      const summary = await getOrGenerateSummary(entity)

      // Fetch related notes
      const { data: links } = await db
        .from("knowledge_links")
        .select("knowledge_id")
        .eq("entity_id", entity.id)

      const knowledgeIds = (links ?? []).map((l: { knowledge_id: string }) => l.knowledge_id)
      let relatedNotes: { id: string; content: string }[] = []

      if (knowledgeIds.length > 0) {
        const { data: notes } = await db
          .from("knowledge")
          .select("id, content")
          .in("id", knowledgeIds)
          .order("created_at", { ascending: false })
          .limit(5)
        relatedNotes = notes ?? []
      }

      return NextResponse.json({
        action: "entity_summary",
        entity: entity.name,
        summary: summary ?? `No summary available for ${entity.name} yet.`,
        relatedNotes,
      })
    }

    // ── /todo → list active tasks ────────────────────────────────────────────────
    if (/^\/todo$/i.test(message)) {
      const { data: tasks } = await db
        .from("tasks")
        .select("id, title, status, due_date, priority")
        .eq("user_id", user.id)
        .in("status", ["doing", "next", "waiting", "inbox"])
        .order("created_at", { ascending: false })
        .limit(10)

      if (!tasks || tasks.length === 0) {
        return NextResponse.json({ action: "answer", text: "No active tasks. Create one with `/task <title>`" })
      }

      const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }
      tasks.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3))

      const sections = [
        { status: "doing", label: "Doing" },
        { status: "next", label: "Next" },
        { status: "waiting", label: "Waiting" },
        { status: "inbox", label: "Inbox" },
      ]

      const today = new Date(); today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)

      let text = "## Tasks\n"
      for (const { status, label } of sections) {
        const group = tasks.filter(t => t.status === status)
        if (group.length === 0) continue
        text += `\n**${label}**\n`
        for (const t of group) {
          let line = `- ${t.title}`
          if (t.due_date) {
            const d = new Date(t.due_date); d.setHours(0, 0, 0, 0)
            if (d.getTime() === today.getTime()) line += " *(today)*"
            else if (d.getTime() === tomorrow.getTime()) line += " *(tomorrow)*"
            else if (d < today) line += " *(overdue)*"
            else line += ` *(${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })})*`
          }
          text += line + "\n"
        }
      }

      return NextResponse.json({ action: "answer", text: text.trim() })
    }

    // ── Natural language → semantic search + AI answer ──────────────────────────
    const answer = await semanticSearch(user.id, message)
    return NextResponse.json({ action: "answer", text: answer })
  } catch (error) {
    console.error("AI chat error:", error)
    return NextResponse.json({ action: "error", text: "Something went wrong. Please try again." }, { status: 500 })
  }
}
