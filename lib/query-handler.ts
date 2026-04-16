import { createHash } from "crypto"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { createEmbedding } from "@/lib/embeddings"
import { upsertEntitiesAndLink } from "@/lib/entities"
import { parseTaskText, createTask } from "@/lib/tasks"
import { getOrGenerateSummary } from "@/lib/entity-summary"
import { semanticSearch, buildKnowledgeContext } from "@/lib/ai-search"
import { askPetAI } from "@/lib/openai"
import { chatWithTools } from "@/lib/ai/chat"
import { userHasGoogle } from "@/lib/ai/tools"
import { parseTimeRange } from "@/lib/time-parser"
import {
  detectSemanticContent,
  fetchNotesByTimeRange,
  fetchNotesByTimeRangeAndSemantics,
  summarizeNotes,
} from "@/lib/temporal-notes"
import {
  extractSpaceTokens,
  syncNoteSpaces,
  extractTagTokens,
  syncNoteTags,
} from "@/app/api/notes/route"
import type { AiResponse } from "@/lib/types"

export interface QueryOptions {
  telegramMessageId?: string
  conversationContext?: string  // group @mention context
  recentConversation?: string   // 1:1 conversation history
  tone?: string                 // response style from user_settings
}

export const COMMANDS = [
  { name: "@ai_3veryone_bot", description: "Ask the group AI (uses your knowledge + recent chat context)" },
  { name: "/save", description: "Save a note to your knowledge base" },
  { name: "/note", description: "Save a note (alias for /save)" },
  { name: "/task", description: "Create a task (supports natural language dates)" },
  { name: "/todo", description: "View your active tasks" },
  { name: "/entity", description: "Explore an entity from your knowledge graph" },
]

export async function handleQuery(
  userId: string,
  message: string,
  options: QueryOptions = {}
): Promise<AiResponse> {
  // ── @mention (group chat AI) ─────────────────────────────────────────────────
  if (/@ai_3veryone_bot/i.test(message)) {
    const question = message.replace(/@ai_3veryone_bot\s*/gi, "").trim()
    return handlePet(userId, question, options.conversationContext ?? "", options.tone)
  }

  // ── Command list ──────────────────────────────────────────────────────────────
  if (message === "/") {
    return { kind: "commands", commands: COMMANDS }
  }

  // ── /save or /note ────────────────────────────────────────────────────────────
  if (/^\/(save|note)\s+/i.test(message)) {
    const content = message.replace(/^\/(save|note)\s+/i, "").trim()
    if (!content) {
      return { kind: "error", text: "Please provide note content after /save or /note" }
    }
    return handleSave(userId, content)
  }

  // ── /task ─────────────────────────────────────────────────────────────────────
  if (/^\/task\b/i.test(message)) {
    const rawText = message.replace(/^\/task\s*/i, "").trim()
    if (!rawText) {
      return {
        kind: "error",
        text: "Usage: /task <title> [due date] [priority]\n\nExamples:\n/task Call Ricky tomorrow\n/task Review proposal next friday high\n/task Send invoice in 3 days",
      }
    }
    return handleTask(userId, rawText, options)
  }

  // ── /todo ─────────────────────────────────────────────────────────────────────
  if (/^\/todo$/i.test(message)) {
    return handleTodo(userId)
  }

  // ── /entity ───────────────────────────────────────────────────────────────────
  if (/^\/entity\s+/i.test(message)) {
    const entityName = message.replace(/^\/entity\s+/i, "").trim()
    if (!entityName) {
      return { kind: "error", text: "Please provide an entity name after /entity" }
    }
    return handleEntity(userId, entityName)
  }

  // ── Google Calendar / Gmail (tool-calling) ───────────────────────────────────
  if (looksLikeCalendarOrEmail(message) && (await userHasGoogle(userId))) {
    const { text, events } = await chatWithTools({
      userId,
      userMessage: message,
      tone: options.tone,
      history: options.recentConversation
        ? [{ role: "user", content: options.recentConversation }]
        : undefined,
    })
    return { kind: "tool_answer", text, events }
  }

  // ── Temporal query ────────────────────────────────────────────────────────────
  const timeRange = parseTimeRange(message)
  if (timeRange) {
    return handleTemporalQuery(userId, message, timeRange)
  }

  // ── Semantic search fallthrough ───────────────────────────────────────────────
  const answer = await semanticSearch(userId, message, options.recentConversation ?? "", options.tone)
  return { kind: "answer", text: answer }
}

// ── Google intent detection ──────────────────────────────────────────────────

const GOOGLE_INTENT_RE =
  /\b(meeting|meetings|calendar|event|events|schedule|scheduling|availability|free|busy|appointment|reminder|gmail|e-?mail|emails|inbox|thread|unread|reply|sent|task|tasks|todo|to-do|to do)\b/i

export function looksLikeCalendarOrEmail(msg: string): boolean {
  if (msg.startsWith("/")) return false
  return GOOGLE_INTENT_RE.test(msg)
}

// ── Private handlers ──────────────────────────────────────────────────────────

async function handleSave(userId: string, content: string): Promise<AiResponse> {
  const db = getSupabaseAdmin()

  const { tagNames } = extractTagTokens(content)
  const { spaceNames } = extractSpaceTokens(content)

  const { data: knowledge, error: insertError } = await db
    .from("knowledge")
    .insert({ user_id: userId, content, role: "note" })
    .select("id, content, created_at")
    .single()

  if (insertError || !knowledge) {
    console.error("Note insert error:", insertError)
    return { kind: "error", text: "Failed to save note." }
  }

  await Promise.all([
    syncNoteSpaces(db, userId, knowledge.id, spaceNames),
    syncNoteTags(db, userId, knowledge.id, tagNames),
  ])

  // Background: embedding + entity extraction
  let resolvedEntities: Array<{ name: string; type: string }> = []

  const backgroundWork = (async () => {
    try {
      const hash = createHash("sha256").update(content).digest("hex")
      const { extractEntities } = await import("@/lib/extractEntities")
      const [embedding, rawEntities] = await Promise.all([
        createEmbedding(content),
        extractEntities(content),
      ])
      const entities = Array.isArray(rawEntities) ? rawEntities : []
      const saved = await upsertEntitiesAndLink(db, userId, knowledge.id, entities)
      resolvedEntities = saved.map((e: { name: string; type: string }) => ({
        name: e.name,
        type: e.type,
      }))
      await db
        .from("knowledge")
        .update({ embedding, content_hash: hash })
        .eq("id", knowledge.id)
    } catch (err) {
      console.error("Background note processing error:", err)
    }
  })()

  try {
    const { waitUntil } = await import("@vercel/functions")
    waitUntil(backgroundWork)
  } catch {
    await backgroundWork
  }

  return { kind: "note_created", note: knowledge, entities: resolvedEntities }
}

async function handleTask(
  userId: string,
  rawText: string,
  options: QueryOptions
): Promise<AiResponse> {
  const db = getSupabaseAdmin()
  const { title, priority, due_date } = parseTaskText(rawText)

  if (!title) {
    return { kind: "error", text: "❌ Could not parse task title. Try: /task <title>" }
  }

  const task = await createTask(db, userId, {
    title,
    priority,
    due_date,
    status: "inbox",
    created_from: options.telegramMessageId ? "telegram" : "manual",
    ...(options.telegramMessageId && { telegram_message_id: options.telegramMessageId }),
  })

  return { kind: "task_created", task: task as unknown as Record<string, unknown> }
}

async function handleTodo(userId: string): Promise<AiResponse> {
  const db = getSupabaseAdmin()

  const { data: tasks } = await db
    .from("tasks")
    .select("id, title, status, due_date, priority")
    .eq("user_id", userId)
    .in("status", ["doing", "next", "waiting", "inbox"])
    .order("created_at", { ascending: false })
    .limit(10)

  if (!tasks || tasks.length === 0) {
    return { kind: "todo_list", tasks: [] }
  }

  const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const sorted = [...tasks].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3)
  )

  return { kind: "todo_list", tasks: sorted }
}

async function handleEntity(userId: string, entityName: string): Promise<AiResponse> {
  const db = getSupabaseAdmin()

  const { data: entity } = await db
    .from("entities")
    .select("*")
    .eq("user_id", userId)
    .ilike("name", entityName)
    .maybeSingle()

  if (!entity) {
    return {
      kind: "answer",
      text: `No entity found matching "${entityName}". Try a different name or check your notes.`,
    }
  }

  const summary = await getOrGenerateSummary(entity)

  const { data: links } = await db
    .from("knowledge_links")
    .select("knowledge_id")
    .eq("entity_id", entity.id)

  const knowledgeIds = (links ?? []).map((l: { knowledge_id: string }) => l.knowledge_id)
  let relatedNotes: Array<{ id: string; content: string }> = []

  if (knowledgeIds.length > 0) {
    const { data: notes } = await db
      .from("knowledge")
      .select("id, content")
      .in("id", knowledgeIds)
      .order("created_at", { ascending: false })
      .limit(5)
    relatedNotes = notes ?? []
  }

  return {
    kind: "entity_summary",
    entityName: entity.name,
    summary: summary ?? `No summary available for ${entity.name} yet.`,
    relatedNotes,
  }
}

async function handlePet(
  userId: string,
  question: string,
  conversationContext: string,
  tone?: string
): Promise<AiResponse> {
  // Get personal knowledge context (entity + semantic RAG) without calling LLM
  const knowledge = await buildKnowledgeContext(userId, question || "recent conversation context")

  const answer = await askPetAI(knowledge, conversationContext, question, tone)
  return { kind: "answer", text: answer ?? "Sorry, I couldn't generate a response." }
}

async function handleTemporalQuery(
  userId: string,
  message: string,
  timeRange: { start: Date; end: Date; label: string }
): Promise<AiResponse> {
  const db = getSupabaseAdmin()
  let notes

  if (detectSemanticContent(message)) {
    const queryEmbedding = await createEmbedding(message)
    notes = await fetchNotesByTimeRangeAndSemantics(
      db,
      userId,
      timeRange.start,
      timeRange.end,
      queryEmbedding
    )
  } else {
    notes = await fetchNotesByTimeRange(db, userId, timeRange.start, timeRange.end)
  }

  if (!notes || notes.length === 0) {
    return { kind: "answer", text: `No notes found for ${timeRange.label}.` }
  }

  const text = await summarizeNotes(notes, timeRange.label)
  return { kind: "temporal_answer", text, rangeLabel: timeRange.label, noteCount: notes.length }
}
