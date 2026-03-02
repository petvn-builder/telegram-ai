import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

const VALID_REPEAT = ["everyday", "weekdays", "weekends"] as const
const MAX_TIMES = 5

function isValidHHMM(t: string): boolean {
  return /^\d{2}:\d{2}$/.test(t) && (() => {
    const [h, m] = t.split(":").map(Number)
    return h >= 0 && h <= 23 && m >= 0 && m <= 59
  })()
}

/**
 * GET /api/scheduled-jobs
 * Returns the authenticated user's scheduled jobs.
 */
export async function GET() {
  const supabase = await getSupabaseServer()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from("telegram_scheduled_jobs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ jobs: data ?? [] })
}

/**
 * PUT /api/scheduled-jobs
 * Upsert a scheduled job for the authenticated user (by job_type).
 * Body: { job_type, send_times, repeat, timezone, enabled }
 */
export async function PUT(req: NextRequest) {
  const supabase = await getSupabaseServer()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: {
    job_type?: string
    send_times?: string[]
    repeat?: string
    timezone?: string
    enabled?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const {
    job_type = "todo",
    send_times = [],
    repeat = "everyday",
    timezone = "UTC",
    enabled = true,
  } = body

  if (!Array.isArray(send_times) || send_times.length > MAX_TIMES) {
    return NextResponse.json({ error: `send_times must be an array of up to ${MAX_TIMES} items` }, { status: 400 })
  }
  if (send_times.some((t) => !isValidHHMM(t))) {
    return NextResponse.json({ error: "send_times must be HH:MM strings (e.g. '07:00')" }, { status: 400 })
  }
  if (!VALID_REPEAT.includes(repeat as typeof VALID_REPEAT[number])) {
    return NextResponse.json({ error: "repeat must be 'everyday', 'weekdays', or 'weekends'" }, { status: 400 })
  }

  // Basic timezone validation — Intl will throw on unknown zones
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone })
  } catch {
    return NextResponse.json({ error: "Invalid timezone" }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from("telegram_scheduled_jobs")
    .upsert(
      {
        user_id: user.id,
        job_type,
        send_times,
        repeat,
        timezone,
        enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,job_type" }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ job: data })
}
