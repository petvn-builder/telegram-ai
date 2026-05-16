"use client"

import { useEffect, useState } from "react"

const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`)

type Slot = string | "" // "" = unset

export default function DailyBriefPanel({ telegramConnected }: { telegramConnected: boolean }) {
  const [enabled, setEnabled] = useState(false)
  const [slot1, setSlot1] = useState<Slot>("")
  const [slot2, setSlot2] = useState<Slot>("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!telegramConnected) { setLoading(false); return }
    let alive = true
    ;(async () => {
      try {
        const res = await fetch("/api/scheduled-jobs")
        if (!res.ok) throw new Error("failed to load")
        const data = await res.json()
        if (!alive) return
        const times: string[] = Array.isArray(data?.send_times) ? data.send_times : []
        setSlot1(times[0] ?? "")
        setSlot2(times[1] ?? "")
        setEnabled(!!data?.enabled)
      } catch {
        if (alive) setErrorMsg("Could not load your schedule.")
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [telegramConnected])

  async function save() {
    setSaving(true)
    setStatus("idle")
    setErrorMsg(null)
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      const send_times = [slot1, slot2].filter((s): s is string => !!s)
      const res = await fetch("/api/scheduled-jobs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ send_times, timezone: tz, enabled }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || "save failed")
      }
      setStatus("saved")
      setTimeout(() => setStatus("idle"), 2000)
    } catch (err) {
      setStatus("error")
      setErrorMsg(err instanceof Error ? err.message : "save failed")
    } finally {
      setSaving(false)
    }
  }

  if (!telegramConnected) {
    return (
      <p style={{ fontSize: "13px", color: "var(--text-3)", margin: 0 }}>
        Connect Telegram above to enable scheduled briefs.
      </p>
    )
  }

  if (loading) {
    return <p style={{ fontSize: "13px", color: "var(--text-3)", margin: 0 }}>Loading…</p>
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <p style={{ fontSize: "13px", color: "var(--text-2)", margin: 0, lineHeight: 1.5 }}>
        Your task list (the <code>/todo</code> brief) will be sent via Telegram at the times you choose. Max 2 per day.
      </p>

      {/* Enable toggle */}
      <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          style={{ width: "16px", height: "16px", accentColor: "var(--accent)" }}
        />
        <span style={{ fontSize: "14px", color: "var(--text-1)" }}>Enable Daily Brief</span>
      </label>

      {/* Slot rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", opacity: enabled ? 1 : 0.5 }}>
        <SlotRow label="Time 1" value={slot1} onChange={setSlot1} disabled={!enabled} />
        <SlotRow label="Time 2" value={slot2} onChange={setSlot2} disabled={!enabled} />
      </div>

      {/* Save */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: "8px 16px",
            borderRadius: "8px",
            border: "1px solid var(--accent)",
            background: "var(--accent)",
            color: "white",
            fontSize: "13px",
            fontWeight: 500,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {status === "saved" && (
          <span style={{ fontSize: "12px", color: "var(--accent)" }}>✓ Saved</span>
        )}
        {status === "error" && errorMsg && (
          <span style={{ fontSize: "12px", color: "#c0392b" }}>{errorMsg}</span>
        )}
      </div>
    </div>
  )
}

function SlotRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: Slot
  onChange: (v: Slot) => void
  disabled: boolean
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <span style={{ fontSize: "12px", color: "var(--text-3)", minWidth: "52px" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          padding: "8px 10px",
          borderRadius: "8px",
          border: "1px solid var(--border)",
          background: "var(--bg-base)",
          color: "var(--text-1)",
          fontSize: "13px",
          minWidth: "120px",
        }}
      >
        <option value="">— Off —</option>
        {HOURS.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      {value && !disabled && (
        <button
          onClick={() => onChange("")}
          style={{
            padding: "6px 10px",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text-2)",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      )}
    </div>
  )
}
