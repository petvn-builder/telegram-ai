import { type EmailOtpType } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

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
    if (!error) {
      // Check if a Google OAuth user was just created for an email that already
      // has an existing email/password account. If so, link them by:
      //   1. Generating a magic-link session for the existing user (no email sent)
      //   2. Deleting the freshly-created Google duplicate
      //   3. Redirecting through the magic-link URL so the browser gets a session
      //      for the original account — completely transparent to the user.
      const { data: { user: oauthUser } } = await supabase.auth.getUser()

      if (oauthUser?.email) {
        const isGoogleOnlyUser =
          oauthUser.app_metadata?.provider === "google" &&
          (oauthUser.identities ?? []).length === 1 &&
          oauthUser.identities![0].provider === "google"

        if (isGoogleOnlyUser && oauthUser.email_confirmed_at) {
          try {
            const adminClient = getSupabaseAdmin()

            // Look up all auth.users rows with this email
            const { data: rows } = await adminClient.rpc(
              "get_auth_user_by_email",
              { p_email: oauthUser.email }
            )

            // Find an existing user with a different id (the email/password account)
            const existing = (rows ?? []).find(
              (r: { id: string; email_confirmed_at: string | null }) =>
                r.id !== oauthUser.id && r.email_confirmed_at !== null
            )

            if (existing) {
              // Generate a one-time magic-link for the existing account.
              // generateLink does NOT send any email — it just returns the URL.
              const { data: linkData, error: linkError } =
                await adminClient.auth.admin.generateLink({
                  type: "magiclink",
                  email: existing.email,
                  options: { redirectTo: `${origin}${safePath}` },
                })

              if (!linkError && linkData?.properties?.action_link) {
                // Remove the duplicate Google-only user before redirecting
                await adminClient.auth.admin.deleteUser(oauthUser.id)
                return NextResponse.redirect(linkData.properties.action_link)
              }
            }
          } catch {
            // Non-fatal: fall through to normal redirect if linking fails
          }
        }
      }

      return redirectResponse
    }
  }

  // Token-hash OTP (implicit flow email confirmation, magic links, password reset)
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) return redirectResponse
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
