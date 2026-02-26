import { redirect } from "next/navigation"
import { getSupabaseServer } from "@/lib/supabase/server"
import DashboardLinks from "./DashboardLinks"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

export default async function DashboardPage() {
  const supabase = await getSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: identity } = await supabase
    .from("user_identities")
    .select("telegram_username, created_at")
    .eq("user_id", user.id)
    .maybeSingle()

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })

  return (
    <div
      className="page-fade-in"
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        padding: "44px 40px",
      }}
    >
      <div style={{ maxWidth: "760px" }}>

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: "40px",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "30px",
                fontWeight: 700,
                color: "var(--text-1)",
                margin: "0 0 6px",
                letterSpacing: "-0.025em",
              }}
            >
              {getGreeting()}
            </h1>
            <p style={{ fontSize: "14px", color: "var(--text-2)", margin: 0 }}>
              {user.email}
            </p>
          </div>
          <p
            style={{
              fontSize: "13px",
              color: "var(--text-3)",
              margin: 0,
              paddingTop: "6px",
              flexShrink: 0,
            }}
          >
            {today}
          </p>
        </div>

        {/* Telegram status banner */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            padding: "16px 20px",
            background: identity ? "rgba(99,102,241,0.06)" : "var(--bg-surface)",
            border: identity
              ? "1px solid var(--border-accent)"
              : "1px solid var(--border)",
            borderRadius: "12px",
            marginBottom: "32px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: identity ? "#34d399" : "var(--text-3)",
                boxShadow: identity ? "0 0 0 3px rgba(52,211,153,0.20)" : "none",
                flexShrink: 0,
              }}
            />
            <div>
              <p
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--text-1)",
                  margin: "0 0 2px",
                }}
              >
                {identity
                  ? `Telegram connected · @${identity.telegram_username}`
                  : "Telegram not connected"}
              </p>
              <p style={{ fontSize: "12px", color: "var(--text-3)", margin: 0 }}>
                {identity
                  ? `Since ${formatDate(identity.created_at)}`
                  : "Connect to start saving knowledge from Telegram"}
              </p>
            </div>
          </div>

          {!identity && (
            <a
              href="/settings"
              style={{
                flexShrink: 0,
                padding: "7px 16px",
                background: "var(--accent)",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                color: "white",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              Connect →
            </a>
          )}
        </div>

        {/* Section label */}
        <p
          style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-3)",
            margin: "0 0 14px",
          }}
        >
          Quick Access
        </p>

        <DashboardLinks />
      </div>
    </div>
  )
}
