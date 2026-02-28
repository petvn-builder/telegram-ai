import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { getOrGenerateSummary } from "@/lib/entity-summary"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authClient = await getSupabaseServer()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const db = getSupabaseAdmin()

    const { data: entity, error } = await db
      .from("entities")
      .select("id, name, type, summary, summary_updated_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (error || !entity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 })
    }

    const summary = await getOrGenerateSummary(entity)

    return NextResponse.json({ summary })
  } catch (error) {
    console.error("Entity summary API error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
