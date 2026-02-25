import { redirect } from "next/navigation"
import { getSupabaseServer } from "@/lib/supabase/server"
import TelegramConnectPanel from "./TelegramConnectPanel"

export default async function SettingsPage() {
  const supabase = await getSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: identity } = await supabase
    .from("user_identities")
    .select("telegram_user_id, telegram_username, created_at")
    .eq("user_id", user.id)
    .maybeSingle()

  return (
    <div style={{
      minHeight: "calc(100vh - 52px)",
      background: "var(--bg-base)",
      padding: "48px 24px",
    }}>
      <div style={{ maxWidth: "560px", margin: "0 auto" }}>

        <h1 style={{ fontSize: "22px", fontWeight: 600, color: "var(--text-1)", margin: "0 0 32px" }}>
          Settings
        </h1>

        {/* Account section */}
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          padding: "24px",
          marginBottom: "16px",
        }}>
          <h2 style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "var(--text-3)",
            margin: "0 0 16px",
          }}>
            Account
          </h2>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: "rgba(99,102,241,0.15)",
              border: "1px solid rgba(99,102,241,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "14px",
              color: "#818cf8",
              fontWeight: 600,
              flexShrink: 0,
            }}>
              {(user.email ?? "?")[0].toUpperCase()}
            </div>
            <div>
              <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-1)", margin: "0 0 2px" }}>
                {user.email}
              </p>
              <p style={{ fontSize: "11px", color: "var(--text-3)", margin: 0 }}>
                Supabase Auth · {user.app_metadata?.provider ?? "email"}
              </p>
            </div>
          </div>
        </div>

        {/* Telegram section */}
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          padding: "24px",
        }}>
          <h2 style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "var(--text-3)",
            margin: "0 0 16px",
          }}>
            Telegram
          </h2>

          <TelegramConnectPanel existingIdentity={identity ?? null} />
        </div>
      </div>
    </div>
  )
}
