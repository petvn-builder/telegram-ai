"use client"

import { useEffect, useRef } from "react"
import { useAiPanel } from "./AiPanelContext"
import ChatBody from "./ChatBody"

export default function ChatModal() {
  const { isOpen, close } = useAiPanel()
  const modalRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) close()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, close])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    function handleMouseDown(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        // Don't close if clicking the floating button (it handles its own toggle)
        const target = e.target as HTMLElement
        if (target.closest(".chat-fab")) return
        close()
      }
    }
    // Use a small delay so the open click doesn't immediately close
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleMouseDown)
    }, 10)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("mousedown", handleMouseDown)
    }
  }, [isOpen, close])

  return (
    <div
      ref={modalRef}
      className={isOpen ? "chat-modal chat-modal-open" : "chat-modal chat-modal-closed"}
      style={{
        position: "fixed",
        bottom: "88px",
        right: "24px",
        width: "400px",
        height: "600px",
        maxHeight: "calc(100vh - 120px)",
        borderRadius: "16px",
        overflow: "hidden",
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.08)",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        transition: "opacity 200ms ease, transform 200ms ease",
      }}
    >
      <ChatBody />
    </div>
  )
}
