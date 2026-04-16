import { NextResponse } from "next/server"
import { createHash, randomBytes } from "crypto"
import { getSupabaseServer } from "@/lib/supabase/server"
import { authUrl } from "@/lib/google/oauth"

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export async function GET() {
  const supabase = await getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const state = base64url(randomBytes(24))
  const codeVerifier = base64url(randomBytes(32))
  const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest())

  const url = authUrl({ state, codeChallenge, loginHint: user.email ?? undefined })
  const res = NextResponse.redirect(url)

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 5, // 5 min
  }
  res.cookies.set("google_oauth_state", state, cookieOpts)
  res.cookies.set("google_oauth_verifier", codeVerifier, cookieOpts)
  return res
}
