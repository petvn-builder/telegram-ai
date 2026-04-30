import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { sendReply } from "@/lib/google/gmail-send"

export async function POST(req: NextRequest) {
  try {
    const authClient = await getSupabaseServer()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const { threadId, draft, subject, to } = body as {
      threadId?: unknown
      draft?: unknown
      subject?: unknown
      to?: unknown
    }

    if (typeof threadId !== "string" || !threadId) {
      return NextResponse.json({ error: "threadId required" }, { status: 400 })
    }
    if (typeof draft !== "string" || !draft.trim()) {
      return NextResponse.json({ error: "draft required" }, { status: 400 })
    }

    const result = await sendReply({
      userId: user.id,
      threadId,
      body: draft,
      subject: typeof subject === "string" ? subject : undefined,
      to: typeof to === "string" ? to : undefined,
    })

    return NextResponse.json(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : "send failed"
    if (/insufficient|invalid_grant|unauthorized|403|401/i.test(msg)) {
      return NextResponse.json(
        { error: "Reconnect Google to grant send permission.", code: "scope_error" },
        { status: 403 }
      )
    }
    console.error("[assistant/reply] send error:", error)
    return NextResponse.json({ error: "Send failed", detail: msg }, { status: 500 })
  }
}
