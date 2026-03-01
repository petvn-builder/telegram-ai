import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

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
      .select()
      .single()

    if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 })
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })

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
    const { error } = await db
      .from("tasks")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) return NextResponse.json({ error: "Delete failed" }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Tasks DELETE error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
