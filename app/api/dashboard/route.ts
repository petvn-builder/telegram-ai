import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export type DashTask = {
  id: string
  title: string
  status: string
  due_date: string | null
  priority: string | null
}

export type DashNote = {
  id: string
  content: string
  created_at: string
}

// ── GET /api/dashboard ────────────────────────────────────────────────────────
// Returns today's focus tasks + recent notes in a single round trip.

export async function GET() {
  try {
    const authClient = await getSupabaseServer()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const db = getSupabaseAdmin()
    const todayStr = new Date().toISOString().split("T")[0] // e.g. "2026-03-03"

    const [tasksRes, notesRes] = await Promise.all([
      // Today's focus: tasks due today/overdue OR undated active tasks, capped at 6
      db
        .from("tasks")
        .select("id, title, status, due_date, priority")
        .eq("user_id", user.id)
        .neq("status", "done")
        .or(
          `due_date.lte.${todayStr},and(due_date.is.null,status.in.(inbox,next,doing))`
        )
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(6),

      // Recent 5 notes
      db
        .from("knowledge")
        .select("id, content, created_at")
        .eq("user_id", user.id)
        .eq("role", "note")
        .order("created_at", { ascending: false })
        .limit(5),
    ])

    if (tasksRes.error) throw tasksRes.error
    if (notesRes.error) throw notesRes.error

    return NextResponse.json({
      tasks: (tasksRes.data ?? []) as DashTask[],
      notes: (notesRes.data ?? []) as DashNote[],
    })
  } catch (error) {
    console.error("Dashboard GET error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
