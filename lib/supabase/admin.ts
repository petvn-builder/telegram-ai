import { createClient } from "@supabase/supabase-js"

/**
 * Returns a Supabase client using the service role key.
 * Bypasses Row Level Security — use ONLY in server-side code.
 * Never import this in client components or expose to the browser.
 *
 * Singleton pattern: safe for long-lived server processes.
 */
let _admin: ReturnType<typeof createClient> | null = null

export function getSupabaseAdmin() {
  if (_admin) return _admin

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for the admin client"
    )
  }

  _admin = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return _admin
}
