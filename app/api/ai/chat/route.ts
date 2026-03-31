import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { getOrCreateUser, resetIfNewDay, isLimitReached, incrementUsage } from "@/lib/user"
import { handleQuery, COMMANDS } from "@/lib/query-handler"
import type { AiResponse } from "@/lib/types"

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

    // "/" without dispatching to handleQuery — instant, no rate limit cost
    if (message === "/") {
      return NextResponse.json({ action: "commands", commands: COMMANDS })
    }

    const db = getSupabaseAdmin()

    // ── Daily rate limit (shared with Telegram) ─────────────────────────────────
    const { data: identity } = await db
      .from("user_identities")
      .select("telegram_user_id")
      .eq("user_id", user.id)
      .single()

    const rateLimitId = identity?.telegram_user_id ?? `web:${user.id}`
    const rateLimitUser = await getOrCreateUser(rateLimitId, user.email ?? "")
    const freshUser = await resetIfNewDay(rateLimitUser)
    if (await isLimitReached(freshUser)) {
      return NextResponse.json({
        action: "error",
        text: "You've reached your daily limit (20 messages). Try again tomorrow.",
      })
    }
    await incrementUsage(freshUser.id)

    // ── Dispatch ─────────────────────────────────────────────────────────────────
    const response = await handleQuery(user.id, message)
    return NextResponse.json(serializeForWeb(response))
  } catch (error) {
    console.error("AI chat error:", error)
    return NextResponse.json({ action: "error", text: "Something went wrong. Please try again." }, { status: 500 })
  }
}

function serializeForWeb(r: AiResponse): Record<string, unknown> {
  switch (r.kind) {
    case "answer":
    case "temporal_answer":
      return { action: "answer", text: r.text }

    case "note_created":
      return { action: "note_created", note: r.note }

    case "task_created":
      return { action: "task_created", task: r.task }

    case "todo_list":
      return { action: "answer", text: buildTodoMarkdown(r.tasks) }

    case "entity_summary":
      return {
        action: "entity_summary",
        entity: r.entityName,
        summary: r.summary,
        relatedNotes: r.relatedNotes,
      }

    case "commands":
      return { action: "commands", commands: r.commands }

    case "error":
      return { action: "error", text: r.text }
  }
}

function buildTodoMarkdown(
  tasks: Array<{ title: string; status: string; due_date: string | null; priority: string }>
): string {
  if (tasks.length === 0) {
    return "No active tasks. Create one with `/task <title>`"
  }

  const sections = [
    { status: "doing",   label: "**Doing**" },
    { status: "next",    label: "**Next**" },
    { status: "waiting", label: "**Waiting**" },
    { status: "inbox",   label: "**Inbox**" },
  ]

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)

  let text = "## Tasks\n"
  for (const { status, label } of sections) {
    const group = tasks.filter((t) => t.status === status)
    if (group.length === 0) continue
    text += `\n${label}\n`
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

  return text.trim()
}
