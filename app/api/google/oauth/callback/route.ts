import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { exchangeCode } from "@/lib/google/oauth"
import { saveTokens } from "@/lib/google/token-store"

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL("/login", req.url))

  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")

  if (error) {
    return NextResponse.redirect(new URL(`/settings/integrations?error=${encodeURIComponent(error)}`, req.url))
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/settings/integrations?error=missing_code", req.url))
  }

  const cookieState = req.cookies.get("google_oauth_state")?.value
  const verifier = req.cookies.get("google_oauth_verifier")?.value
  if (!cookieState || !verifier || cookieState !== state) {
    return NextResponse.redirect(new URL("/settings/integrations?error=state_mismatch", req.url))
  }

  try {
    const tokens = await exchangeCode(code, verifier)
    await saveTokens(user.id, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiry: tokens.expiry,
      scopes: tokens.scopes,
      googleEmail: tokens.googleEmail,
    })
  } catch (e) {
    console.error("[google/callback] exchange failed:", e)
    return NextResponse.redirect(new URL("/settings/integrations?error=exchange_failed", req.url))
  }

  const res = NextResponse.redirect(new URL("/settings/integrations?connected=google", req.url))
  res.cookies.delete("google_oauth_state")
  res.cookies.delete("google_oauth_verifier")
  return res
}
