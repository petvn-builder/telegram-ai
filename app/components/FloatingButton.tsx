"use client"

import { useAiPanel } from "./AiPanelContext"
import { SparkleIcon } from "./ChatBody"

export default function FloatingButton() {
  const { isOpen, toggle } = useAiPanel()

  if (isOpen) return null

  return (
    <button
      onClick={toggle}
      className="chat-fab"
      title="Open AI Companion"
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 50,
        height: "48px",
        borderRadius: "24px",
        background: "linear-gradient(135deg, #7C3AED, #6366F1, #818CF8)",
        border: "none",
        cursor: "pointer",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "0 18px 0 14px",
        boxShadow: "0 4px 20px rgba(99, 102, 241, 0.35), 0 2px 6px rgba(124, 58, 237, 0.2)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
    >
      <SparkleIcon size={18} />
      <span style={{ fontSize: "13px", fontWeight: 600, letterSpacing: "-0.01em" }}>
        AI Companion
      </span>
    </button>
  )
}
