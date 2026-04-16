import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { loadTokens, deleteTokens } from "@/lib/google/token-store"

export async function GET() {
  const supabase = await getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const tokens = await loadTokens(user.id)
    if (!tokens) return NextResponse.json({ connected: false })
    return NextResponse.json({
      connected: true,
      google_email: tokens.googleEmail ?? null,
      scopes: tokens.scopes,
      expires_at: tokens.expiry.toISOString(),
    })
  } catch (e) {
    console.error("[google/status] error:", e)
    return NextResponse.json({ connected: false, error: "status_error" }, { status: 500 })
  }
}

export async function DELETE() {
  const supabase = await getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await deleteTokens(user.id)
  return NextResponse.json({ connected: false })
}
