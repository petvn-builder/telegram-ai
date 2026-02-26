import { type EmailOtpType } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { NextRequest, NextResponse } from "next/server"

/**
 * Handles all Supabase Auth redirect flows:
 * 1. PKCE code exchange (?code=xxx) — OAuth (Google) + modern email confirmation
 * 2. Token-hash OTP (?token_hash=xxx&type=...) — implicit flow email confirmation,
 *    magic links, password reset, email change
 *
 * Important: cookies must be set directly on the redirect NextResponse object,
 * not via next/headers cookies(). The latter doesn't propagate to a redirect response.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const next = searchParams.get("next") ?? "/dashboard"
  const safePath = next.startsWith("/") ? next : "/dashboard"

  // Build the success redirect response first so cookies can be attached to it
  const redirectResponse = NextResponse.redirect(`${origin}${safePath}`)

  // Client reads from request cookies and writes directly to the redirect response
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            redirectResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // PKCE code exchange (OAuth + modern email confirmation)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return redirectResponse
  }

  // Token-hash OTP (implicit flow email confirmation, magic links, password reset)
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) return redirectResponse
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
