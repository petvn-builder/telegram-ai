"use client"

import { useState, useEffect, useCallback } from "react"

interface ScheduledJob {
  id: string
  job_type: string
  send_times: string[]
  repeat: "everyday" | "weekdays" | "weekends"
  timezone: string
  enabled: boolean
  last_sent_at: string | null
}

const REPEAT_OPTIONS = [
  { value: "everyday", label: "Every day" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekends", label: "Weekends" },
] as const

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Ho_Chi_Minh",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
]

function formatLastSent(iso: string | null): string {
  if (!iso) return "Never sent"
  const d = new Date(iso)
  return `Last sent ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
}

// AM = hour 5–12 stored as "07:00", PM = hour 17+ stored as "21:00"
function hasAm(times: string[]): boolean {
  return times.some((t) => { const h = parseInt(t.split(":")[0], 10); return h >= 5 && h <= 12 })
}
function hasPm(times: string[]): boolean {
  return times.some((t) => parseInt(t.split(":")[0], 10) >= 17)
}
function buildTimes(am: boolean, pm: boolean): string[] {
  const result: string[] = []
  if (am) result.push("07:00")
  if (pm) result.push("21:00")
  return result
}

interface Props {
  hasTelegram: boolean
}

export default function ScheduledJobsPanel({ hasTelegram }: Props) {
  const [job, setJob] = useState<ScheduledJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [enabled, setEnabled] = useState(false)
  const [amEnabled, setAmEnabled] = useState(false)
  const [pmEnabled, setPmEnabled] = useState(false)
  const [repeat, setRepeat] = useState<"everyday" | "weekdays" | "weekends">("everyday")
  const [timezone, setTimezone] = useState("UTC")

  const fetchJob = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/scheduled-jobs")
      const data = await res.json()
      const todoJob = (data.jobs ?? []).find((j: ScheduledJob) => j.job_type === "todo") ?? null
      setJob(todoJob)
      if (todoJob) {
        setEnabled(todoJob.enabled)
        setAmEnabled(hasAm(todoJob.send_times ?? []))
        setPmEnabled(hasPm(todoJob.send_times ?? []))
        setRepeat(todoJob.repeat ?? "everyday")
        setTimezone(todoJob.timezone ?? "UTC")
      } else {
        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
        setTimezone(COMMON_TIMEZONES.includes(browserTz) ? browserTz : "UTC")
      }
    } catch {
      setError("Failed to load automation settings.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchJob() }, [fetchJob])

  async function save() {
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const res = await fetch("/api/scheduled-jobs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_type: "todo",
          send_times: buildTimes(amEnabled, pmEnabled),
          repeat,
          timezone,
          enabled,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to save")
      setJob(data.job)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p style={{ fontSize: "13px", color: "var(--text-3)", margin: 0 }}>Loading…</p>
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {!hasTelegram && (
        <div style={{
          background: "rgba(248,113,113,0.08)",
          border: "1px solid rgba(248,113,113,0.2)",
          borderRadius: "10px",
          padding: "12px 16px",
          fontSize: "12px",
          color: "#f87171",
          lineHeight: 1.5,
        }}>
          Connect your Telegram account first to use automation.
        </div>
      )}

      {/* Auto Todo card */}
      <div style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "18px",
        opacity: hasTelegram ? 1 : 0.5,
        pointerEvents: hasTelegram ? "auto" : "none",
      }}>

        {/* Header + master enable toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-1)", margin: "0 0 2px" }}>
              Auto Todo
            </p>
            <p style={{ fontSize: "12px", color: "var(--text-3)", margin: 0 }}>
              Sends your task list to Telegram on schedule
            </p>
          </div>
          <button
            onClick={() => setEnabled((v) => !v)}
            style={{
              position: "relative",
              width: "40px",
              height: "22px",
              borderRadius: "999px",
              border: "none",
              cursor: "pointer",
              background: enabled ? "var(--accent)" : "var(--border)",
              transition: "background 0.18s",
              flexShrink: 0,
              padding: 0,
            }}
            aria-label={enabled ? "Disable" : "Enable"}
          >
            <span style={{
              position: "absolute",
              top: "3px",
              left: enabled ? "21px" : "3px",
              width: "16px",
              height: "16px",
              borderRadius: "50%",
              background: "white",
              transition: "left 0.18s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }} />
          </button>
        </div>

        {/* Last sent info */}
        {job !== null && (
          <p style={{ fontSize: "11px", color: "var(--text-3)", margin: "-10px 0 0" }}>
            {formatLastSent(job.last_sent_at)}
          </p>
        )}

        {/* AM / PM send slots */}
        <div>
          <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-2)", margin: "0 0 10px" }}>
            Send times
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {/* Morning */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              background: amEnabled ? "var(--accent-dim)" : "var(--bg-surface)",
              border: `1px solid ${amEnabled ? "var(--border-accent)" : "var(--border)"}`,
              borderRadius: "10px",
              transition: "background 0.15s, border-color 0.15s",
            }}>
              <div>
                <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-1)", margin: "0 0 2px" }}>
                  🌅 Morning
                </p>
                <p style={{ fontSize: "11px", color: "var(--text-3)", margin: 0 }}>
                  Around 7 AM in your timezone
                </p>
              </div>
              <button
                onClick={() => setAmEnabled((v) => !v)}
                style={{
                  position: "relative",
                  width: "36px",
                  height: "20px",
                  borderRadius: "999px",
                  border: "none",
                  cursor: "pointer",
                  background: amEnabled ? "var(--accent)" : "var(--border)",
                  transition: "background 0.18s",
                  flexShrink: 0,
                  padding: 0,
                }}
                aria-label={amEnabled ? "Disable morning" : "Enable morning"}
              >
                <span style={{
                  position: "absolute",
                  top: "2px",
                  left: amEnabled ? "18px" : "2px",
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  background: "white",
                  transition: "left 0.18s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </button>
            </div>

            {/* Evening */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              background: pmEnabled ? "var(--accent-dim)" : "var(--bg-surface)",
              border: `1px solid ${pmEnabled ? "var(--border-accent)" : "var(--border)"}`,
              borderRadius: "10px",
              transition: "background 0.15s, border-color 0.15s",
            }}>
              <div>
                <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-1)", margin: "0 0 2px" }}>
                  🌙 Evening
                </p>
                <p style={{ fontSize: "11px", color: "var(--text-3)", margin: 0 }}>
                  Around 9 PM in your timezone
                </p>
              </div>
              <button
                onClick={() => setPmEnabled((v) => !v)}
                style={{
                  position: "relative",
                  width: "36px",
                  height: "20px",
                  borderRadius: "999px",
                  border: "none",
                  cursor: "pointer",
                  background: pmEnabled ? "var(--accent)" : "var(--border)",
                  transition: "background 0.18s",
                  flexShrink: 0,
                  padding: 0,
                }}
                aria-label={pmEnabled ? "Disable evening" : "Enable evening"}
              >
                <span style={{
                  position: "absolute",
                  top: "2px",
                  left: pmEnabled ? "18px" : "2px",
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  background: "white",
                  transition: "left 0.18s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </button>
            </div>
          </div>
        </div>

        {/* Repeat */}
        <div>
          <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-2)", margin: "0 0 8px" }}>
            Repeat
          </p>
          <div style={{ display: "flex", gap: "6px" }}>
            {REPEAT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRepeat(opt.value)}
                style={{
                  padding: "5px 12px",
                  borderRadius: "6px",
                  border: repeat === opt.value ? "1px solid var(--border-accent)" : "1px solid var(--border)",
                  background: repeat === opt.value ? "var(--accent-dim)" : "transparent",
                  color: repeat === opt.value ? "var(--accent)" : "var(--text-2)",
                  fontSize: "12px",
                  fontWeight: repeat === opt.value ? 500 : 400,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Timezone */}
        <div>
          <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-2)", margin: "0 0 8px" }}>
            Timezone
          </p>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            style={{
              padding: "6px 10px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "7px",
              color: "var(--text-1)",
              fontSize: "13px",
              outline: "none",
              cursor: "pointer",
              width: "100%",
              maxWidth: "280px",
            }}
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>

        {/* Save */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingTop: "4px" }}>
          <button
            onClick={save}
            disabled={saving}
            style={{
              padding: "8px 18px",
              background: "var(--accent)",
              border: "none",
              borderRadius: "8px",
              color: "white",
              fontSize: "13px",
              fontWeight: 500,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>

          {success && <span style={{ fontSize: "12px", color: "#34d399" }}>Saved</span>}
          {error && <span style={{ fontSize: "12px", color: "#f87171" }}>{error}</span>}
        </div>
      </div>
    </div>
  )
}
