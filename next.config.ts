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
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `
              default-src 'self';
              script-src 'self' ${isDev ? "'unsafe-eval'" : ""} 'unsafe-inline';
              style-src 'self' 'unsafe-inline';
              img-src 'self' data: blob: https://lh3.googleusercontent.com;
              font-src 'self' data:;
              connect-src 'self' http://localhost:3000 ws://localhost:3000 ${supabaseOrigin} ${supabaseHostname ? `wss://${supabaseHostname}` : ""};
              frame-src 'self';
            `.replace(/\n/g, ""),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
