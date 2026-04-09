"use client"

import { useState } from "react"

const TONES = [
  { value: "professional", label: "Professional", emoji: "💼", desc: "Clear and precise" },
  { value: "gen_z",        label: "Gen Z",        emoji: "🤙", desc: "Hài hước, dí dỏm, sassy" },
  { value: "casual",       label: "Casual",       emoji: "😊", desc: "Friendly like texting" },
  { value: "formal",       label: "Formal",       emoji: "🎩", desc: "Polite and proper" },
]

export default function TonePicker({ initialTone }: { initialTone: string }) {
  const [current, setCurrent] = useState(initialTone)
  const [saving, setSaving] = useState(false)

  async function select(tone: string) {
    if (tone === current || saving) return
    setSaving(true)
    try {
      await fetch("/api/settings/tone", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone }),
      })
      setCurrent(tone)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {TONES.map((t) => {
        const active = t.value === current
        return (
          <button
            key={t.value}
            onClick={() => select(t.value)}
            disabled={saving}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 14px",
              borderRadius: "10px",
              border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
              background: active ? "var(--accent-dim)" : "transparent",
              cursor: saving ? "not-allowed" : "pointer",
              textAlign: "left",
              transition: "border-color 0.15s, background 0.15s",
              opacity: saving && !active ? 0.5 : 1,
            }}
          >
            <span style={{ fontSize: "18px", lineHeight: 1 }}>{t.emoji}</span>
            <div>
              <p style={{
                fontSize: "13px",
                fontWeight: active ? 600 : 500,
                color: active ? "var(--accent)" : "var(--text-1)",
                margin: 0,
              }}>
                {t.label}
              </p>
              <p style={{ fontSize: "11px", color: "var(--text-3)", margin: "2px 0 0" }}>
                {t.desc}
              </p>
            </div>
            {active && (
              <span style={{ marginLeft: "auto", color: "var(--accent)", fontSize: "13px" }}>✓</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
