import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET() {
  try {
    const authClient = await getSupabaseServer()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const db = getSupabaseAdmin()

    const { data: spaces, error } = await db
      .from("spaces")
      .select("id, name, created_at")
      .eq("user_id", user.id)
      .order("name", { ascending: true })

    if (error) throw error

    if (!spaces || spaces.length === 0) return NextResponse.json([])

    const spaceIds = spaces.map((s) => s.id)

    // Count notes per space
    const { data: counts, error: countError } = await db
      .from("note_spaces")
      .select("space_id")
      .in("space_id", spaceIds)

    if (countError) throw countError

    const countMap = new Map<string, number>()
    for (const row of counts ?? []) {
      countMap.set(row.space_id, (countMap.get(row.space_id) ?? 0) + 1)
    }

    const result = spaces.map((s) => ({
      id: s.id,
      name: s.name,
      note_count: countMap.get(s.id) ?? 0,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error("Spaces GET error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authClient = await getSupabaseServer()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const name = (body.name ?? "").toLowerCase().trim()
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 })

    const db = getSupabaseAdmin()

    // Upsert to avoid duplicate error
    const { data, error } = await db
      .from("spaces")
      .upsert({ user_id: user.id, name }, { onConflict: "user_id,name" })
      .select("id, name")
      .single()

    if (error || !data) {
      console.error("Space create error:", error)
      return NextResponse.json({ error: "Create failed" }, { status: 500 })
    }

    return NextResponse.json({ id: data.id, name: data.name, note_count: 0 })
  } catch (error) {
    console.error("Spaces POST error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
