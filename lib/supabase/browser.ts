import { createBrowserClient } from "@supabase/ssr"

/**
 * Returns a Supabase client for use in browser (client) components.
 * Reads NEXT_PUBLIC_ env vars — safe to use in client bundles.
 * Automatically manages session storage and token refresh in the browser.
 */
export function getSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
