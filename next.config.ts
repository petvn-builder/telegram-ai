import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Extract Supabase origin for CSP (e.g. "https://abc.supabase.co")
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseOrigin = supabaseUrl
  ? (() => { try { return new URL(supabaseUrl).origin } catch { return "" } })()
  : "";
const supabaseHostname = supabaseUrl
  ? (() => { try { return new URL(supabaseUrl).hostname } catch { return "" } })()
  : "";

const nextConfig: NextConfig = {
  async headers() {
    return [
      // Cache the graph response in the browser for 60s, allow stale-while-revalidate for 5min
      {
        source: "/api/graph",
        headers: [
          { key: "Cache-Control", value: "private, max-age=60, stale-while-revalidate=300" },
        ],
      },
      // Cache spaces list for 30s (cheap to re-fetch, changes rarely)
      {
        source: "/api/spaces",
        headers: [
          { key: "Cache-Control", value: "private, max-age=30" },
        ],
      },
      // Cache dashboard data: 30s fresh + 120s stale-while-revalidate
      {
        source: "/api/dashboard",
        headers: [
          { key: "Cache-Control", value: "private, max-age=30, stale-while-revalidate=120" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `
              default-src 'self';
              script-src 'self' ${isDev ? "'unsafe-eval'" : ""} 'unsafe-inline' https://us-assets.i.posthog.com;
              style-src 'self' 'unsafe-inline';
              img-src 'self' data: blob: https://lh3.googleusercontent.com https://us.i.posthog.com;
              font-src 'self' data:;
              connect-src 'self' http://localhost:3000 ws://localhost:3000 ${supabaseOrigin} ${supabaseHostname ? `wss://${supabaseHostname}` : ""} https://us.i.posthog.com https://us-assets.i.posthog.com;
              frame-src 'self';
            `.replace(/\n/g, ""),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
