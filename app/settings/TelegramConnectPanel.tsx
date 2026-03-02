"use client"

import { useState } from "react"

interface ExistingIdentity {
  telegram_user_id: string
  telegram_username: string
  created_at: string
}

interface Props {
  existingIdentity: ExistingIdentity | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export default function TelegramConnectPanel({ existingIdentity }: Props) {
  const [identity, setIdentity] = useState<ExistingIdentity | null>(existingIdentity)
  const [deepLink, setDeepLink] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generateLink() {
    setLoading(true)
    setError(null)
    setDeepLink(null)

    try {
      const res = await fetch("/api/auth/telegram-link", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to generate link")
      setDeepLink(data.deepLink)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect your Telegram account? You can reconnect anytime.")) return
    setDisconnecting(true)
    setError(null)

    try {
      const res = await fetch("/api/auth/telegram-link", { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to disconnect")
      setIdentity(null)
      setDeepLink(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setDisconnecting(false)
    }
  }

  if (identity && !deepLink) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Connected state */}
        <div style={{
          background: "var(--accent-dim)",
          border: "1px solid var(--border-accent)",
          borderRadius: "12px",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
        }}>
          <div>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--accent)", margin: "0 0 3px" }}>
              @{identity.telegram_username}
            </p>
            <p style={{ fontSize: "11px", color: "var(--text-3)", margin: 0 }}>
              Connected {formatDate(identity.created_at)}
            </p>
          </div>
          <span style={{
            fontSize: "11px",
            background: "rgba(16,185,129,0.12)",
            color: "#34d399",
            border: "1px solid rgba(16,185,129,0.20)",
            borderRadius: "999px",
            padding: "3px 10px",
            fontWeight: 500,
          }}>
            Active
          </span>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={generateLink}
            disabled={loading || disconnecting}
            style={{
              padding: "7px 14px",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              color: "var(--text-2)",
              fontSize: "12px",
              cursor: loading || disconnecting ? "not-allowed" : "pointer",
              transition: "border-color 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!loading && !disconnecting) {
                e.currentTarget.style.borderColor = "var(--border-hover)"
                e.currentTarget.style.color = "var(--text-1)"
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)"
              e.currentTarget.style.color = "var(--text-2)"
            }}
          >
            {loading ? "Generating…" : "Connect different account"}
          </button>

          <button
            onClick={disconnect}
            disabled={loading || disconnecting}
            style={{
              padding: "7px 14px",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              color: disconnecting ? "var(--text-3)" : "#f87171",
              fontSize: "12px",
              cursor: loading || disconnecting ? "not-allowed" : "pointer",
              transition: "border-color 0.15s, color 0.15s",
              opacity: disconnecting ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!loading && !disconnecting) {
                e.currentTarget.style.borderColor = "#f87171"
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)"
            }}
          >
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>

        {error && (
          <p style={{ fontSize: "12px", color: "#f87171", margin: 0 }}>{error}</p>
        )}
      </div>
    )
  }

  if (deepLink) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "20px",
        }}>
          <p style={{ fontSize: "13px", color: "var(--text-1)", margin: "0 0 16px", lineHeight: 1.6 }}>
            Click the button below to open Telegram. The bot will confirm your account is linked.
          </p>

          <a
            href={deepLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              background: "#2AABEE",
              borderRadius: "8px",
              color: "white",
              fontSize: "13px",
              fontWeight: 600,
              textDecoration: "none",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.85" }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.927 6.688l-1.687 7.952c-.125.574-.463.713-.937.443l-2.583-1.905-1.246 1.198c-.138.138-.254.254-.52.254l.185-2.635 4.796-4.333c.208-.186-.045-.289-.323-.103L7.26 14.56 4.72 13.785c-.557-.173-.568-.557.116-.824l8.878-3.42c.464-.173.87.103.717.824h.496v.323z"/>
            </svg>
            Open in Telegram
          </a>

          <p style={{ fontSize: "11px", color: "var(--text-3)", margin: "12px 0 0" }}>
            This link expires in 5 minutes.
          </p>
        </div>

        <button
          onClick={generateLink}
          disabled={loading}
          style={{
            alignSelf: "flex-start",
            padding: "7px 14px",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            color: "var(--text-3)",
            fontSize: "12px",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Generating…" : "Generate new link"}
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <p style={{ fontSize: "13px", color: "var(--text-2)", margin: 0, lineHeight: 1.6 }}>
        Connect your Telegram account to save notes and build your knowledge graph directly from Telegram.
      </p>

      <button
        onClick={generateLink}
        disabled={loading}
        style={{
          alignSelf: "flex-start",
          padding: "9px 18px",
          background: "transparent",
          border: "1px solid var(--border-hover)",
          borderRadius: "8px",
          color: loading ? "var(--text-3)" : "var(--text-1)",
          fontSize: "13px",
          fontWeight: 500,
          cursor: loading ? "not-allowed" : "pointer",
          transition: "border-color 0.16s, color 0.16s",
          opacity: loading ? 0.6 : 1,
        }}
        onMouseEnter={(e) => { if (!loading) e.currentTarget.style.borderColor = "var(--accent)" }}
        onMouseLeave={(e) => { if (!loading) e.currentTarget.style.borderColor = "var(--border-hover)" }}
      >
        {loading ? "Generating link…" : "Connect Telegram"}
      </button>

      {error && (
        <p style={{ fontSize: "12px", color: "#f87171", margin: 0 }}>{error}</p>
      )}
    </div>
  )
}
