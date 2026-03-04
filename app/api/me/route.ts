import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET() {
  const authClient = await getSupabaseServer()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = getSupabaseAdmin()
  const { data: identity } = await db
    .from("user_identities")
    .select("telegram_username")
    .eq("user_id", user.id)
    .maybeSingle()

  return NextResponse.json({
    email: user.email ?? null,
    hasIdentity: !!identity,
  })
}
