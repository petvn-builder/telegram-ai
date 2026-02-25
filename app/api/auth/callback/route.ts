import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"

/**
 * Handles two types of Supabase Auth redirects:
 * 1. OAuth (Google): Supabase redirects here after Google auth with ?code=xxx
 * 2. Email confirmation: Supabase redirects here after user clicks the email link
 *
 * Both cases use PKCE flow: exchangeCodeForSession() trades the code for a session
 * and sets the session cookie automatically via the server client.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/dashboard"

  if (code) {
    const supabase = await getSupabaseServer()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Ensure `next` is a relative path to prevent open redirect attacks
      const safePath = next.startsWith("/") ? next : "/dashboard"
      return NextResponse.redirect(`${origin}${safePath}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
