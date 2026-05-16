import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

const HH00 = /^([01]\d|2[0-3]):00$/

export async function GET() {
  const supabase = await getSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data, error } = await getSupabaseAdmin()
    .from("telegram_scheduled_jobs")
    .select("send_times, timezone, enabled, last_sent_at")
    .eq("user_id", user.id)
    .eq("job_type", "todo")
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? { send_times: [], timezone: "UTC", enabled: false, last_sent_at: null })
}

export async function PUT(req: NextRequest) {
  const supabase = await getSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null) as
    | { send_times?: unknown; timezone?: unknown; enabled?: unknown }
    | null
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 })

  const { send_times, timezone, enabled } = body

  if (!Array.isArray(send_times)) {
    return NextResponse.json({ error: "send_times must be an array" }, { status: 400 })
  }
  if (send_times.length > 2) {
    return NextResponse.json({ error: "max 2 times per day" }, { status: 400 })
  }
  for (const t of send_times) {
    if (typeof t !== "string" || !HH00.test(t)) {
      return NextResponse.json({ error: `invalid time: ${String(t)} (expected HH:00)` }, { status: 400 })
    }
  }
  if (typeof timezone !== "string" || !timezone) {
    return NextResponse.json({ error: "timezone required" }, { status: 400 })
  }
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 })
  }

  const deduped = Array.from(new Set(send_times as string[])).sort()

  const { error } = await getSupabaseAdmin()
    .from("telegram_scheduled_jobs")
    .upsert(
      {
        user_id: user.id,
        job_type: "todo",
        send_times: deduped,
        timezone,
        enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,job_type" }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, send_times: deduped, timezone, enabled })
}
