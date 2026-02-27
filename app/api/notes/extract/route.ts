import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const authClient = await getSupabaseServer()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const content = (body.content ?? "").trim()
    if (!content) return NextResponse.json({ entities: [] })

    const { extractEntities } = await import("@/lib/extractEntities")
    const raw = await extractEntities(content)
    const entities = (Array.isArray(raw) ? raw : []).map((e: any) => ({
      name: e.name,
      type: e.type,
    }))

    return NextResponse.json({ entities })
  } catch (error) {
    console.error("Extract API error:", error)
    return NextResponse.json({ entities: [] })
  }
}
