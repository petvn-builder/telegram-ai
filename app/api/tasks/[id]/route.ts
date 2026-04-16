import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { pushUpdate, pushDelete } from "@/lib/google/task-sync"

// ── PATCH /api/tasks/:id ───────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authClient = await getSupabaseServer()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const allowed = ["title", "description", "status", "priority", "due_date"]
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    const db = getSupabaseAdmin()
    const { data, error } = await db
      .from("tasks")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*, google_task_id, google_task_list_id")
      .single()

    if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 })
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Push update to Google Tasks in the background
    const syncWork = pushUpdate(user.id, data)
    try {
      const { waitUntil } = await import("@vercel/functions")
      waitUntil(syncWork)
    } catch {
      syncWork.catch(() => {})
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Tasks PATCH error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

// ── DELETE /api/tasks/:id ──────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authClient = await getSupabaseServer()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const db = getSupabaseAdmin()

    // Fetch google_task_id before deleting
    const { data: task } = await db
      .from("tasks")
      .select("google_task_id, google_task_list_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle()

    const { error } = await db
      .from("tasks")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) return NextResponse.json({ error: "Delete failed" }, { status: 500 })

    // Push delete to Google Tasks in the background
    if (task?.google_task_id) {
      const syncWork = pushDelete(user.id, task.google_task_id, task.google_task_list_id || "@default")
      try {
        const { waitUntil } = await import("@vercel/functions")
        waitUntil(syncWork)
      } catch {
        syncWork.catch(() => {})
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Tasks DELETE error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
