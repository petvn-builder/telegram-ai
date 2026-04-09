import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"

const VALID_TONES = ["professional", "gen_z", "casual", "formal"]

export async function GET() {
  const supabase = await getSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data } = await supabase
    .from("user_settings")
    .select("tone")
    .eq("user_id", user.id)
    .maybeSingle()

  return NextResponse.json({ tone: data?.tone ?? "professional" })
}

export async function PATCH(req: Request) {
  const supabase = await getSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { tone } = await req.json()
  if (!VALID_TONES.includes(tone)) {
    return NextResponse.json({ error: "Invalid tone" }, { status: 400 })
  }

  await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, tone, updated_at: new Date().toISOString() })

  return NextResponse.json({ tone })
}
