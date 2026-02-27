import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authClient = await getSupabaseServer()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const db = getSupabaseAdmin()

    // Verify ownership
    const { data: space } = await db
      .from("spaces")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle()

    if (!space) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // note_spaces rows removed via CASCADE
    const { error } = await db.from("spaces").delete().eq("id", id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Space DELETE error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authClient = await getSupabaseServer()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const body = await req.json()
    const name = (body.name ?? "").toLowerCase().trim()
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 })

    const db = getSupabaseAdmin()

    const { data, error } = await db
      .from("spaces")
      .update({ name })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, name")
      .single()

    if (error || !data) {
      console.error("Space PATCH error:", error)
      return NextResponse.json({ error: "Update failed" }, { status: 500 })
    }

    return NextResponse.json({ id: data.id, name: data.name })
  } catch (error) {
    console.error("Space PATCH error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
