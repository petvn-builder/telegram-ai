import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET() {
  const supabase = await getSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = getSupabaseAdmin()

  // Fetch tags with note usage count
  const { data: tags, error } = await db
    .from("tags")
    .select("id, name, note_tags(count)")
    .eq("user_id", user.id)
    .order("name", { ascending: true })

  if (error) {
    console.error("GET /api/tags error:", error)
    return NextResponse.json({ error: "Failed to fetch tags" }, { status: 500 })
  }

  const result = (tags ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    note_count: t.note_tags?.[0]?.count ?? 0,
  }))

  return NextResponse.json(result)
}
