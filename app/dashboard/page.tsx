import { redirect } from "next/navigation"
import Link from "next/link"
import { getSupabaseServer } from "@/lib/supabase/server"
import DashboardLinks from "./DashboardLinks"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export default async function DashboardPage() {
  const supabase = await getSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  // Check if Telegram is linked
  const { data: identity } = await supabase
    .from("user_identities")
    .select("telegram_username, created_at")
    .eq("user_id", user.id)
    .maybeSingle()

  const email = user.email ?? ""
  const displayEmail = email.length > 32 ? email.slice(0, 29) + "…" : email

  return (
    <div
      className="page-fade-in"
      style={{
        minHeight: "calc(100vh - 52px)",
        background: "var(--bg-base)",
        padding: "48px 24px",
      }}
    >
      <div style={{ maxWidth: "680px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: "40px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: "var(--text-1)", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
            Welcome back
          </h1>
          <p style={{ fontSize: "13px", color: "var(--text-2)", margin: 0 }}>{displayEmail}</p>
        </div>

        {/* Telegram status */}
        <div style={{
          background: "var(--bg-surface)",
          border: identity ? "1px solid var(--border-accent)" : "1px solid var(--border)",
          borderRadius: "16px",
          padding: "24px",
          marginBottom: "20px",
          transition: "border-color 0.2s",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
            <div>
              <p style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-2)", margin: "0 0 8px" }}>
                Telegram
              </p>

              {identity ? (
                <>
                  <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-1)", margin: "0 0 4px" }}>
                    @{identity.telegram_username}
                  </p>
                  <p style={{ fontSize: "12px", color: "var(--text-2)", margin: 0 }}>
                    Connected {formatDate(identity.created_at)}
                  </p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: "14px", color: "var(--text-1)", margin: "0 0 4px" }}>
                    Not connected
                  </p>
                  <p style={{ fontSize: "12px", color: "var(--text-2)", margin: 0 }}>
                    Connect Telegram to start saving knowledge
                  </p>
                </>
              )}
            </div>

            {!identity && (
              <Link
                href="/settings"
                style={{
                  flexShrink: 0,
                  padding: "7px 14px",
                  background: "#6366f1",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "white",
                  textDecoration: "none",
                }}
              >
                Connect →
              </Link>
            )}
          </div>
        </div>

        {/* Quick links */}
        <DashboardLinks />
      </div>
    </div>
  )
}
