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
      title="Open AI Assistant"
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 50,
        width: "52px",
        height: "52px",
        borderRadius: "50%",
        background: "var(--ai-accent)",
        border: "none",
        cursor: "pointer",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
    >
      <SparkleIcon size={22} />
    </button>
  )
}
