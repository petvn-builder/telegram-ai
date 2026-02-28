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
        padding: "48px 48px",
      }}
    >
      <div style={{ maxWidth: "680px" }}>

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
                fontSize: "26px",
                fontWeight: 600,
                color: "var(--text-1)",
                margin: "0 0 6px",
                letterSpacing: "-0.02em",
              }}
            >
              {getGreeting()}
            </h1>
            <p style={{ fontSize: "14px", color: "var(--text-3)", margin: 0 }}>
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
            padding: "18px 24px",
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "14px",
            marginBottom: "36px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: identity ? "#16A34A" : "var(--text-3)",
                flexShrink: 0,
              }}
            />
            <div>
              <p
                style={{
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "var(--text-1)",
                  margin: "0 0 3px",
                }}
              >
                {identity
                  ? `Telegram connected · @${identity.telegram_username}`
                  : "Telegram not connected"}
              </p>
              <p style={{ fontSize: "13px", color: "var(--text-3)", margin: 0 }}>
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
                background: "transparent",
                border: "1px solid var(--border-hover)",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--text-1)",
                textDecoration: "none",
                whiteSpace: "nowrap",
                transition: "border-color 0.16s, background 0.16s",
              }}
            >
              Connect →
            </a>
          )}
        </div>

        {/* Section label */}
        <p
          style={{
            fontSize: "13px",
            fontWeight: 400,
            color: "var(--text-3)",
            margin: "0 0 14px",
          }}
        >
          Quick access
        </p>

        <DashboardLinks />
      </div>
    </div>
  )
}
