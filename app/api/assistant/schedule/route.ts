import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { createCalendarEvent } from "@/lib/google/calendar-create"

const ALLOWED_DURATIONS = new Set([30, 60, 90, 120])

export async function POST(req: NextRequest) {
  try {
    const authClient = await getSupabaseServer()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { title, suggestedSlot, duration, description } = body as {
      title?: unknown
      suggestedSlot?: unknown
      duration?: unknown
      description?: unknown
    }

    if (typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title required" }, { status: 400 })
    }
    if (typeof suggestedSlot !== "string" || !suggestedSlot) {
      return NextResponse.json({ error: "suggestedSlot required" }, { status: 400 })
    }
    if (typeof duration !== "number" || !ALLOWED_DURATIONS.has(duration)) {
      return NextResponse.json({ error: "duration must be 30 | 60 | 90 | 120" }, { status: 400 })
    }

    const start = new Date(suggestedSlot)
    if (Number.isNaN(start.getTime())) {
      return NextResponse.json({ error: "invalid suggestedSlot" }, { status: 400 })
    }
    const end = new Date(start.getTime() + duration * 60_000)

    const tz = process.env.BRAINOS_MCP_TIMEZONE ?? undefined

    const event = await createCalendarEvent({
      userId: user.id,
      summary: title,
      start,
      end,
      description: typeof description === "string" ? description : undefined,
      timeZone: tz,
      sendUpdates: "none",
    })

    return NextResponse.json({
      id: event.id,
      summary: event.summary,
      start: event.start,
      end: event.end,
      htmlLink: event.htmlLink,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "schedule failed"
    if (/insufficient|invalid_grant|unauthorized|403|401/i.test(msg)) {
      return NextResponse.json(
        { error: "Reconnect Google to grant calendar permission.", code: "scope_error" },
        { status: 403 }
      )
    }
    console.error("[assistant/schedule] error:", error)
    return NextResponse.json({ error: "Schedule failed", detail: msg }, { status: 500 })
  }
}
