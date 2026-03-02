"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { fetcher } from "@/lib/fetcher"
import { useAiPanel } from "./AiPanelContext"
import type { NoteWithEntities, TaskWithEntities } from "@/app/notes/types"

// ── Types ─────────────────────────────────────────────────────────────────────

type AiResultContent =
  | { type: "notes"; notes: NoteWithEntities[] }
  | { type: "task_created"; task: TaskWithEntities }
  | { type: "text"; text: string }
  | { type: "error"; text: string }
  | { type: "loading" }

type AiUserMessage = { role: "user"; text: string; id: string }
type AiAssistantMessage = { role: "assistant"; content: AiResultContent; id: string }
type AiMessage = AiUserMessage | AiAssistantMessage
type AiMessageInput = { role: "user"; text: string } | { role: "assistant"; content: AiResultContent }

// ── Icons ─────────────────────────────────────────────────────────────────────

function SparkleIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

// ── Quick command suggestions ─────────────────────────────────────────────────

const QUICK_COMMANDS = [
  "Create task: ",
  "Find notes about: ",
  "Summarize recent notes",
]

// ── Message rendering ─────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: AiMessage }) {
  if (msg.role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "10px" }}>
        <div style={{
          maxWidth: "85%",
          background: "var(--accent-dim)",
          border: "1px solid var(--border-accent)",
          borderRadius: "12px 12px 3px 12px",
          padding: "9px 13px",
          fontSize: "13px",
          color: "var(--text-1)",
          lineHeight: 1.5,
        }}>
          {msg.text}
        </div>
      </div>
    )
  }

  const { content } = msg

  if (content.type === "loading") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", padding: "0 4px" }}>
        <span style={{ color: "var(--ai-accent)", display: "flex" }}><SparkleIcon /></span>
        <span className="skeleton" style={{ height: "14px", width: "120px", borderRadius: "6px", display: "block" }} />
      </div>
    )
  }

  if (content.type === "text" || content.type === "error") {
    return (
      <div style={{ marginBottom: "10px" }}>
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "8px",
        }}>
          <span style={{ color: "var(--ai-accent)", display: "flex", alignItems: "center", flexShrink: 0, marginTop: "2px" }}>
            <SparkleIcon />
          </span>
          <p style={{
            fontSize: "13px",
            color: content.type === "error" ? "#DC2626" : "var(--text-1)",
            lineHeight: 1.6,
            margin: 0,
          }}>
            {content.text}
          </p>
        </div>
      </div>
    )
  }

  if (content.type === "notes") {
    return (
      <div style={{ marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <span style={{ color: "var(--ai-accent)", display: "flex" }}><SparkleIcon /></span>
          <span style={{ fontSize: "12px", color: "var(--text-2)" }}>Found {content.notes.length} note{content.notes.length !== 1 ? "s" : ""}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {content.notes.slice(0, 4).map((note) => (
            <Link
              key={note.id}
              href={`/notes?open=${note.id}`}
              style={{
                display: "block",
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "9px 12px",
                textDecoration: "none",
                transition: "border-color 0.16s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)" }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)" }}
            >
              <p style={{ fontSize: "12px", color: "var(--text-1)", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {note.content.replace(/\n/g, " ").slice(0, 70)}
              </p>
              <p style={{ fontSize: "11px", color: "var(--text-3)", margin: 0 }}>
                {new Date(note.created_at).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  if (content.type === "task_created") {
    return (
      <div style={{ marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
          <span style={{ color: "var(--ai-accent)", display: "flex" }}><SparkleIcon /></span>
          <span style={{ fontSize: "12px", color: "var(--text-2)" }}>Task created</span>
        </div>
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "9px 12px",
        }}>
          <p style={{ fontSize: "13px", color: "var(--text-1)", margin: "0 0 3px" }}>{content.task.title}</p>
          <p style={{ fontSize: "11px", color: "var(--text-3)", margin: 0, textTransform: "capitalize" }}>{content.task.status} · {content.task.priority} priority</p>
        </div>
      </div>
    )
  }

  return null
}

// ── AiPanel ───────────────────────────────────────────────────────────────────

export default function AiPanel() {
  const { close, pendingCommand, clearPendingCommand } = useAiPanel()
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [input, setInput] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { data: notes = [] } = useSWR<NoteWithEntities[]>("/api/notes?limit=50", fetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })

  // Handle pending command injected from outside (e.g., CommandBar or note detail)
  useEffect(() => {
    if (pendingCommand !== null) {
      if (pendingCommand !== "") {
        handleCommand(pendingCommand)
      }
      clearPendingCommand()
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [pendingCommand])

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  function addMessage(msg: AiMessageInput) {
    const id = Math.random().toString(36).slice(2)
    setMessages((prev) => [...prev, { ...msg, id } as AiMessage])
    return id
  }

  function updateLastAssistantMessage(content: AiResultContent) {
    setMessages((prev) => {
      const next = [...prev]
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === "assistant") {
          next[i] = { ...next[i], content } as AiMessage
          break
        }
      }
      return next
    })
  }

  async function handleCommand(rawInput: string) {
    const text = rawInput.trim()
    if (!text) return

    addMessage({ role: "user", text })
    setIsProcessing(true)

    // Show loading
    addMessage({ role: "assistant", content: { type: "loading" } })

    await new Promise((r) => setTimeout(r, 400)) // small delay for feel

    const q = text.toLowerCase()

    // Pattern: create task
    if (/^(create|add)\s+task[:\s]/i.test(text)) {
      const title = text.replace(/^(create|add)\s+task[:\s]+/i, "").trim()
      if (!title) {
        updateLastAssistantMessage({ type: "error", text: "Please provide a task title." })
        setIsProcessing(false)
        return
      }
      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, status: "inbox", priority: "medium", created_from: "manual" }),
        })
        const task = await res.json()
        updateLastAssistantMessage({ type: "task_created", task })
      } catch {
        updateLastAssistantMessage({ type: "error", text: "Failed to create task. Please try again." })
      }
      setIsProcessing(false)
      return
    }

    // Pattern: create note
    if (/^(create|new|add)\s+note[:\s]/i.test(text)) {
      const content = text.replace(/^(create|new|add)\s+note[:\s]+/i, "").trim()
      if (!content) {
        updateLastAssistantMessage({ type: "error", text: "Please provide note content." })
        setIsProcessing(false)
        return
      }
      try {
        await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        })
        updateLastAssistantMessage({ type: "text", text: `Note created: "${content.slice(0, 60)}${content.length > 60 ? "…" : ""}"` })
      } catch {
        updateLastAssistantMessage({ type: "error", text: "Failed to create note." })
      }
      setIsProcessing(false)
      return
    }

    // Pattern: find / search notes
    if (/^(find|search|look for|show)\s+/i.test(text)) {
      const keyword = text.replace(/^(find|search|look for|show)\s+(notes?\s+(about|for|with|containing)?\s*)?/i, "").trim()
      const matched = notes
        .filter((n) => n.content.toLowerCase().includes(keyword.toLowerCase()))
        .slice(0, 5)
      if (matched.length === 0) {
        updateLastAssistantMessage({ type: "text", text: `No notes found containing "${keyword}".` })
      } else {
        updateLastAssistantMessage({ type: "notes", notes: matched })
      }
      setIsProcessing(false)
      return
    }

    // Pattern: summarize recent
    if (/^summarize/i.test(text)) {
      const recent = notes.slice(0, 5)
      if (recent.length === 0) {
        updateLastAssistantMessage({ type: "text", text: "No notes to summarize yet." })
      } else {
        updateLastAssistantMessage({ type: "notes", notes: recent })
      }
      setIsProcessing(false)
      return
    }

    // Default fallback
    updateLastAssistantMessage({
      type: "text",
      text: "I can help you create tasks, create notes, and search your knowledge base. Try:\n• \"create task: Call Alex tomorrow\"\n• \"find notes about project\"\n• \"summarize recent notes\"",
    })
    setIsProcessing(false)
  }

  function handleSubmit() {
    const text = input.trim()
    if (!text || isProcessing) return
    setInput("")
    handleCommand(text)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const isEmpty = messages.length === 0

  return (
    <aside
      className="ai-panel-enter"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "var(--ai-panel-w)",
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        zIndex: 40,
      }}
    >
      {/* Header */}
      <div style={{
        padding: "16px 16px 14px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        flexShrink: 0,
      }}>
        <span style={{ color: "var(--ai-accent)", display: "flex" }}>
          <SparkleIcon size={16} />
        </span>
        <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-1)", flex: 1 }}>AI Assistant</span>
        <button
          onClick={close}
          style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)", display: "flex", alignItems: "center", padding: "4px", borderRadius: "6px", transition: "color 0.16s" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-1)" }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)" }}
        >
          <CloseIcon />
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {isEmpty && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px", paddingBottom: "40px" }}>
            <div style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: "var(--ai-accent-dim)",
              border: "1px solid var(--ai-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--ai-accent)",
            }}>
              <SparkleIcon size={20} />
            </div>
            <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-1)", margin: 0, textAlign: "center" }}>
              AI Assistant
            </p>
            <p style={{ fontSize: "12px", color: "var(--text-3)", margin: 0, textAlign: "center", lineHeight: 1.6 }}>
              Create tasks, search notes,<br />and more with natural language.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick suggestions — shown only when no messages */}
      {isEmpty && (
        <div style={{ padding: "0 16px 10px", display: "flex", flexDirection: "column", gap: "5px" }}>
          <p style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px" }}>
            Try asking
          </p>
          {QUICK_COMMANDS.map((cmd) => (
            <button
              key={cmd}
              onClick={() => setInput(cmd)}
              style={{
                display: "block",
                padding: "7px 12px",
                background: "var(--bg-hover)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                fontSize: "12px",
                color: "var(--text-2)",
                cursor: "pointer",
                textAlign: "left",
                transition: "border-color 0.16s, color 0.16s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--ai-border)"
                e.currentTarget.style.color = "var(--text-1)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)"
                e.currentTarget.style.color = "var(--text-2)"
              }}
            >
              {cmd}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: "12px 16px",
        borderTop: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <div style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "8px",
          background: "var(--bg-base)",
          border: "1px solid var(--border)",
          borderRadius: "10px",
          padding: "8px 10px",
          transition: "border-color 0.18s",
        }}
          onFocusCapture={(e) => { e.currentTarget.style.borderColor = "var(--ai-border)" }}
          onBlurCapture={(e) => { e.currentTarget.style.borderColor = "var(--border)" }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything…"
            rows={1}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              fontSize: "13px",
              color: "var(--text-1)",
              fontFamily: "inherit",
              lineHeight: 1.5,
              maxHeight: "100px",
              overflowY: "auto",
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isProcessing}
            style={{
              background: input.trim() && !isProcessing ? "var(--ai-accent)" : "transparent",
              border: "none",
              cursor: input.trim() && !isProcessing ? "pointer" : "default",
              color: input.trim() && !isProcessing ? "#fff" : "var(--text-3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "5px",
              borderRadius: "6px",
              flexShrink: 0,
              transition: "background 0.18s, color 0.18s",
            }}
          >
            <SendIcon />
          </button>
        </div>
        <p style={{ fontSize: "10px", color: "var(--text-3)", margin: "5px 0 0", textAlign: "center" }}>
          ↵ send · shift+↵ newline
        </p>
      </div>
    </aside>
  )
}
