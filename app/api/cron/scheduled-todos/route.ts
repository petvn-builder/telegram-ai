import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { handleTodo } from "@/lib/query-handler"
import { formatTodoList } from "@/lib/telegram-format"
import { sendTelegram } from "@/lib/telegram-send"
import type { AiResponse } from "@/lib/types"

const DEDUPE_WINDOW_MS = 50 * 60 * 1000 // 50 minutes

function currentHourInTz(now: Date, tz: string): string {
  try {
    const h = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: tz,
    }).format(now)
    // Intl can return "24" for midnight in some locales; normalize.
    const hh = h === "24" ? "00" : h.padStart(2, "0")
    return `${hh}:00`
  } catch {
    return "??:??"
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get("authorization") || ""
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
  }

  const db = getSupabaseAdmin()
  const now = new Date()

  const { data: jobs, error } = await db
    .from("telegram_scheduled_jobs")
    .select("id, user_id, send_times, timezone, last_sent_at")
    .eq("enabled", true)
    .eq("job_type", "todo")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let sent = 0
  let skipped = 0
  const errors: Array<{ user_id: string; reason: string }> = []

  for (const job of jobs ?? []) {
    try {
      const target = currentHourInTz(now, job.timezone || "UTC")
      const times: string[] = Array.isArray(job.send_times) ? job.send_times : []
      if (!times.includes(target)) { skipped++; continue }

      if (job.last_sent_at) {
        const last = new Date(job.last_sent_at).getTime()
        if (now.getTime() - last < DEDUPE_WINDOW_MS) { skipped++; continue }
      }

      const { data: identity } = await db
        .from("user_identities")
        .select("telegram_user_id")
        .eq("user_id", job.user_id)
        .maybeSingle()

      if (!identity?.telegram_user_id) {
        errors.push({ user_id: job.user_id, reason: "no telegram identity" })
        continue
      }

      const response: AiResponse = await handleTodo(job.user_id)
      if (response.kind !== "todo_list") {
        errors.push({ user_id: job.user_id, reason: `unexpected response kind: ${response.kind}` })
        continue
      }

      const text = formatTodoList(response)
      await sendTelegram(identity.telegram_user_id, text)

      await db
        .from("telegram_scheduled_jobs")
        .update({ last_sent_at: new Date().toISOString() })
        .eq("id", job.id)

      sent++
    } catch (err) {
      errors.push({
        user_id: job.user_id,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({ sent, skipped, errors })
}
