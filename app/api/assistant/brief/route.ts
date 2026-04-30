import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { loadTokens } from "@/lib/google/token-store"
import {
  getEmails,
  getCalendarEvents,
  getFreeSlots,
  type SourceStatus,
} from "@/lib/mcp/client"
import {
  emailToItem,
  eventToItem,
  taskToItem,
  noteToItem,
  scoreItem,
  type ContextItem,
} from "@/lib/assistant/context"
import { generateBrief, type BriefOutput } from "@/lib/assistant/brief"
import type { DashTask, DashNote } from "@/app/api/dashboard/route"

const TOP_N_FOR_LLM = 30

export type BriefResponse = BriefOutput & {
  items: ContextItem[]
  sources: {
    gmail: SourceStatus
    calendar: SourceStatus
    tasks: SourceStatus
    notes: SourceStatus
  }
  generatedAt: string
}

function resolveTimeZone(): string {
  return process.env.BRAINOS_MCP_TIMEZONE ?? "UTC"
}

function todayHuman(tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date())
}

export async function GET() {
  try {
    const authClient = await getSupabaseServer()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const db = getSupabaseAdmin()
    const tz = resolveTimeZone()
    const todayStr = new Date().toISOString().split("T")[0]
    const tokens = await loadTokens(user.id).catch(() => null)
    const ctx = {
      userId: user.id,
      timeZone: tz,
      myEmail: tokens?.googleEmail ?? user.email ?? undefined,
    }

    const [tasksRes, notesRes, emailsRes, eventsRes, freeRes] = await Promise.all([
      db
        .from("tasks")
        .select("id, title, status, due_date, priority")
        .eq("user_id", user.id)
        .neq("status", "done")
        .or(
          `due_date.lte.${todayStr},and(due_date.is.null,status.in.(inbox,next,doing))`
        )
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(15),
      db
        .from("knowledge")
        .select("id, content, created_at")
        .eq("user_id", user.id)
        .eq("role", "note")
        .order("created_at", { ascending: false })
        .limit(8),
      getEmails(ctx),
      getCalendarEvents(ctx),
      getFreeSlots(ctx, { durationMinutes: 30, maxSlots: 3 }),
    ])

    const tasks: DashTask[] = (tasksRes.data ?? []) as DashTask[]
    const notes: DashNote[] = (notesRes.data ?? []) as DashNote[]

    const sources = {
      gmail: emailsRes.status,
      calendar: eventsRes.status,
      tasks: (tasksRes.error ? "error" : "ok") as SourceStatus,
      notes: (notesRes.error ? "error" : "ok") as SourceStatus,
    }

    const allItems: ContextItem[] = [
      ...tasks.map(taskToItem),
      ...notes.map(noteToItem),
      ...emailsRes.data.map(emailToItem),
      ...eventsRes.data.map(eventToItem),
    ].sort((a, b) => scoreItem(b) - scoreItem(a))

    const llmItems = allItems.slice(0, TOP_N_FOR_LLM)

    if (process.env.NODE_ENV !== "production") {
      console.log("[assistant/brief]", {
        totalItems: allItems.length,
        sentToLLM: llmItems.length,
        freeSlots: freeRes.data.length,
        sources,
      })
    }

    const brief = await generateBrief(llmItems, {
      timeZone: tz,
      now: new Date().toISOString(),
      todayHuman: todayHuman(tz),
      freeSlots: freeRes.data,
    })

    const response: BriefResponse = {
      ...brief,
      items: allItems,
      sources,
      generatedAt: new Date().toISOString(),
    }
    return NextResponse.json(response)
  } catch (error) {
    console.error("Assistant brief error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
