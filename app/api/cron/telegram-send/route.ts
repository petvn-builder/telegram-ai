import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any

/**
 * Get the local HH:MM for a given UTC date and IANA timezone string.
 */
function getLocalHHMM(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date)

  const h = parts.find((p) => p.type === "hour")?.value ?? "00"
  const m = parts.find((p) => p.type === "minute")?.value ?? "00"
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`
}

/**
 * Determine whether a job should be sent now.
 *
 * slot = "am" → fires at midnight UTC (≈7AM UTC+7). Match if user's local hour is 5–12
 *              AND user has an AM-window time configured (hour 5–12).
 * slot = "pm" → fires at 14:00 UTC (≈9PM UTC+7). Match if user's local hour is 17–24
 *              AND user has a PM-window time configured (hour 17–23).
 *
 * Matching by window (not exact minute) handles Hobby cron's ±59 min precision.
 */
function shouldSendNow(job: AnyRow, nowUtc: Date, slot: "am" | "pm"): boolean {
  if (!job.send_times || job.send_times.length === 0) return false

  const timezone = job.timezone ?? "UTC"
  const localHHMM = getLocalHHMM(nowUtc, timezone)
  const localHour = parseInt(localHHMM.split(":")[0], 10)

  // Day-of-week filter using local time
  const localWeekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(nowUtc)
  const isWeekend = localWeekday === "Sat" || localWeekday === "Sun"
  if (job.repeat === "weekdays" && isWeekend) return false
  if (job.repeat === "weekends" && !isWeekend) return false

  // Check user has a configured time in the relevant window
  const hasAmTime = job.send_times.some((t: string) => {
    const h = parseInt(t.split(":")[0], 10)
    return h >= 5 && h <= 12
  })
  const hasPmTime = job.send_times.some((t: string) => {
    const h = parseInt(t.split(":")[0], 10)
    return h >= 17
  })

  if (slot === "am") return hasAmTime && localHour >= 5 && localHour <= 12
  if (slot === "pm") return hasPmTime && localHour >= 17
  return false
}

async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    }
  )
}

async function buildTodoMessage(userId: string): Promise<string> {
  const admin = getSupabaseAdmin()

  const { data: tasks } = await admin
    .from("tasks")
    .select("title, status, due_date, priority")
    .eq("user_id", userId)
    .in("status", ["doing", "next", "waiting", "inbox"])
    .order("created_at", { ascending: false })
    .limit(10)

  if (!tasks || tasks.length === 0) {
    return "📋 No active tasks. Add one at brain.petvn.com"
  }

  const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }
  tasks.sort((a: AnyRow, b: AnyRow) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3))

  const sections = [
    { status: "doing", label: "🔵 Doing" },
    { status: "next", label: "⏭ Next" },
    { status: "waiting", label: "⏳ Waiting" },
    { status: "inbox", label: "📥 Inbox" },
  ]

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)

  let msg = "📋 Tasks\n"
  for (const { status, label } of sections) {
    const group = tasks.filter((t: AnyRow) => t.status === status)
    if (group.length === 0) continue
    msg += `\n${label}\n`
    for (const t of group) {
      msg += `• ${t.title}`
      if (t.due_date) {
        const d = new Date(t.due_date); d.setHours(0, 0, 0, 0)
        if (d.getTime() === today.getTime()) msg += " (today)"
        else if (d.getTime() === tomorrow.getTime()) msg += " (tomorrow)"
        else if (d < today) msg += " (⚠ overdue)"
        else msg += ` (${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })})`
      }
      msg += "\n"
    }
  }

  return msg.trim()
}

/**
 * GET /api/cron/telegram-send?slot=am|pm
 *
 * Called by Vercel Cron twice a day:
 *   - ?slot=am  at 0:00 UTC  (≈7 AM UTC+7)
 *   - ?slot=pm  at 14:00 UTC (≈9 PM UTC+7)
 *
 * Sends scheduled Telegram messages to users whose jobs match the current slot.
 */
export async function GET(req: NextRequest) {
  // Verify this is a legitimate Vercel cron invocation
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const slot = (new URL(req.url).searchParams.get("slot") ?? "am") as "am" | "pm"
  const nowUtc = new Date()
  const admin = getSupabaseAdmin()

  // Fetch all enabled jobs joined with user's telegram_user_id (chat_id)
  const { data: jobs, error } = await admin
    .from("telegram_scheduled_jobs")
    .select(`
      id,
      user_id,
      job_type,
      send_times,
      repeat,
      timezone,
      last_sent_at,
      user_identities!inner ( telegram_user_id )
    `)
    .eq("enabled", true)

  if (error) {
    console.error("[Cron] Failed to fetch jobs:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  let sent = 0

  for (const job of jobs) {
    // Skip if sent in the last 20 hours — prevents double-send when AM/PM crons fire near window boundaries
    if (job.last_sent_at) {
      const msSinceLast = nowUtc.getTime() - new Date(job.last_sent_at).getTime()
      if (msSinceLast < 20 * 60 * 60 * 1000) continue
    }

    if (!shouldSendNow(job, nowUtc, slot)) continue

    const telegramUserId = job.user_identities?.telegram_user_id
    if (!telegramUserId) continue

    try {
      let message = "🤖 Scheduled reminder"

      if (job.job_type === "todo") {
        message = await buildTodoMessage(job.user_id)
      }

      await sendTelegramMessage(telegramUserId, message)

      await admin
        .from("telegram_scheduled_jobs")
        .update({ last_sent_at: nowUtc.toISOString() })
        .eq("id", job.id)

      sent++
      console.log(`[Cron/${slot}] Sent '${job.job_type}' job ${job.id} to user ${job.user_id}`)
    } catch (err) {
      console.error(`[Cron/${slot}] Failed to send job ${job.id}:`, err)
    }
  }

  return NextResponse.json({ sent, checked: jobs.length, slot })
}
