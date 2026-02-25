import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/**
 * Returns a Supabase client for use in server components and API route handlers.
 * Reads/writes the session cookie via next/headers.
 *
 * The setAll try/catch is required: Server Components cannot set cookies,
 * so those calls silently no-op. Middleware handles the actual session refresh.
 */
export async function getSupabaseServer() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Intentionally ignored — cannot set cookies from a Server Component.
          }
        },
      },
    }
  )
}
