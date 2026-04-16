"use client"

import { useEffect, useState } from "react"

interface Status {
  connected: boolean
  google_email?: string | null
  scopes?: string[]
  expires_at?: string
}

export default function GoogleConnectPanel() {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)

  async function refresh() {
    try {
      const res = await fetch("/api/google/status", { cache: "no-store" })
      setStatus(await res.json())
    } catch {
      setStatus({ connected: false })
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function disconnect() {
    setBusy(true)
    try {
      await fetch("/api/google/status", { method: "DELETE" })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  if (status === null) {
    return <p style={{ fontSize: "13px", color: "var(--text-3)", margin: 0 }}>Loading…</p>
  }

  if (!status.connected) {
    return (
      <div>
        <p style={{ fontSize: "13px", color: "var(--text-2)", margin: "0 0 12px" }}>
          Connect Google to let BrainOS read your calendar and Gmail.
        </p>
        <a
          href="/api/google/oauth/start"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: "var(--ai-accent)",
            color: "white",
            borderRadius: "8px",
            padding: "8px 14px",
            fontSize: "13px",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Connect Google
        </a>
      </div>
    )
  }

  return (
    <div>
      <p style={{ fontSize: "13px", color: "var(--text-1)", margin: "0 0 4px", fontWeight: 500 }}>
        {status.google_email ?? "Connected"}
      </p>
      <p style={{ fontSize: "12px", color: "var(--text-3)", margin: "0 0 14px" }}>
        {status.scopes?.length ?? 0} scopes granted
      </p>
      <button
        onClick={disconnect}
        disabled={busy}
        style={{
          background: "transparent",
          color: "var(--text-2)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "7px 12px",
          fontSize: "12px",
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "Disconnecting…" : "Disconnect"}
      </button>
    </div>
  )
}
