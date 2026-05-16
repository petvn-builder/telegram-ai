import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { handleTodo } from "@/lib/query-handler"
import { formatTodoList } from "@/lib/telegram-format"
import { sendTelegram } from "@/lib/telegram-send"
import type { AiResponse } from "@/lib/types"

const LOOKBACK_MS = 59 * 60 * 1000 // 59 minutes
const DEDUPE_WINDOW_MS = 60 * 60 * 1000 // 60 minutes

// Returns minutes-since-midnight in the given IANA timezone.
function minutesSinceMidnightInTz(at: Date, tz: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    }).formatToParts(at)
    const h = parts.find((p) => p.type === "hour")?.value
    const m = parts.find((p) => p.type === "minute")?.value
    if (h == null || m == null) return null
    const hh = h === "24" ? 0 : Number(h)
    const mm = Number(m)
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null
    return hh * 60 + mm
  } catch {
    return null
  }
}

// Parse "HH:MM" → minutes-since-midnight.
function parseSlot(slot: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(slot)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

// True if `slot` falls within the lookback window ending at `nowMinutes` (in same tz, mod 24h).
function slotInLookback(slotMinutes: number, nowMinutes: number, lookbackMinutes: number): boolean {
  // Account for wraparound: e.g. lookback at 00:30 should cover 23:31..00:30.
  const diff = (nowMinutes - slotMinutes + 24 * 60) % (24 * 60)
  return diff >= 0 && diff <= lookbackMinutes
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
      const tz = job.timezone || "UTC"
      const nowMin = minutesSinceMidnightInTz(now, tz)
      if (nowMin == null) { skipped++; continue }

      const times: string[] = Array.isArray(job.send_times) ? job.send_times : []
      const matched = times.some((slot) => {
        const m = parseSlot(slot)
        return m != null && slotInLookback(m, nowMin, LOOKBACK_MS / 60000)
      })
      if (!matched) { skipped++; continue }

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
