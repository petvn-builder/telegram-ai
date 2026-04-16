import { redirect } from "next/navigation"
import { getSupabaseServer } from "@/lib/supabase/server"
import TelegramConnectPanel from "./TelegramConnectPanel"
import TonePicker from "./TonePicker"
import GoogleConnectPanel from "./GoogleConnectPanel"

export default async function SettingsPage() {
  const supabase = await getSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const [{ data: identity }, { data: userSettings }] = await Promise.all([
    supabase
      .from("user_identities")
      .select("telegram_user_id, telegram_username, created_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("user_settings")
      .select("tone")
      .eq("user_id", user.id)
      .maybeSingle(),
  ])

  return (
    <div
      className="page-fade-in"
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        padding: "48px 48px",
      }}
    >
      <div style={{ maxWidth: "520px" }}>

        <h1 style={{
          fontSize: "22px",
          fontWeight: 600,
          color: "var(--text-1)",
          margin: "0 0 36px",
          letterSpacing: "-0.015em",
        }}>
          Settings
        </h1>

        {/* Account section */}
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "14px",
          padding: "28px",
          marginBottom: "20px",
        }}>
          <h2 style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--text-2)",
            margin: "0 0 20px",
          }}>
            Account
          </h2>

          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: "var(--accent-dim)",
              border: "1px solid var(--border-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "14px",
              color: "var(--accent)",
              fontWeight: 600,
              flexShrink: 0,
            }}>
              {(user.email ?? "?")[0].toUpperCase()}
            </div>
            <div>
              <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-1)", margin: "0 0 3px" }}>
                {user.email}
              </p>
              <p style={{ fontSize: "12px", color: "var(--text-3)", margin: 0 }}>
                {user.app_metadata?.provider ?? "email"}
              </p>
            </div>
          </div>
        </div>

        {/* Telegram section */}
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "14px",
          padding: "28px",
          marginBottom: "20px",
        }}>
          <h2 style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--text-2)",
            margin: "0 0 20px",
          }}>
            Telegram
          </h2>

          <TelegramConnectPanel existingIdentity={identity ?? null} />
        </div>

        {/* Google section */}
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "14px",
          padding: "28px",
          marginBottom: "20px",
        }}>
          <h2 style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--text-2)",
            margin: "0 0 20px",
          }}>
            Google (Calendar + Gmail)
          </h2>

          <GoogleConnectPanel />
        </div>

        {/* Response style section */}
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "14px",
          padding: "28px",
        }}>
          <h2 style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--text-2)",
            margin: "0 0 20px",
          }}>
            Response Style
          </h2>

          <TonePicker initialTone={userSettings?.tone ?? "professional"} />
        </div>

      </div>
    </div>
  )
}
