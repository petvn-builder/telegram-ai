"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useAiPanel } from "./AiPanelContext"
import type { NoteWithEntities, TaskWithEntities } from "@/app/notes/types"

// ── Types ─────────────────────────────────────────────────────────────────────

type AiCommand = { name: string; description: string }

type AiResultContent =
  | { type: "notes"; notes: NoteWithEntities[] }
  | { type: "task_created"; task: TaskWithEntities }
  | { type: "text"; text: string }
  | { type: "error"; text: string }
  | { type: "loading" }
  | { type: "entity_summary"; entity: string; summary: string; relatedNotes: { id: string; content: string }[] }
  | { type: "commands"; commands: AiCommand[] }

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
  "/task ",
  "/note ",
  "/entity ",
]

// ── Markdown renderer ─────────────────────────────────────────────────────────

function inlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__)/)
  return parts.map((part, i) => {
    if (/^\*\*(.+)\*\*$/.test(part) || /^__(.+)__$/.test(part)) {
      return <strong key={i} style={{ fontWeight: 600 }}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

function renderMarkdown(text: string): React.ReactNode {
  const blocks = text.split(/\n\n+/)
  return blocks.map((block, i) => {
    const headingMatch = block.match(/^#{1,3}\s+(.+)/)
    if (headingMatch) {
      return (
        <p key={i} style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-1)", margin: i === 0 ? "0 0 2px" : "8px 0 2px" }}>
          {inlineMarkdown(headingMatch[1])}
        </p>
      )
    }
    const lines = block.split("\n")
    const isList = lines.length > 0 && lines.filter(l => l.trim()).every(l => /^\s*[-•*]\s/.test(l))
    if (isList) {
      return (
        <ul key={i} style={{ margin: i === 0 ? "0" : "6px 0 0", padding: 0, listStyle: "none" }}>
          {lines.filter(l => l.trim()).map((l, j) => (
            <li key={j} style={{ fontSize: "13px", color: "var(--text-1)", lineHeight: 1.6, marginBottom: "2px", display: "flex", gap: "6px" }}>
              <span style={{ color: "var(--ai-accent)", flexShrink: 0, marginTop: "1px" }}>·</span>
              <span>{inlineMarkdown(l.replace(/^\s*[-•*]\s+/, ""))}</span>
            </li>
          ))}
        </ul>
      )
    }
    return (
      <p key={i} style={{ fontSize: "13px", color: "var(--text-1)", lineHeight: 1.6, margin: i === 0 ? "0" : "6px 0 0" }}>
        {lines.map((line, j) => (
          <span key={j}>{inlineMarkdown(line)}{j < lines.length - 1 ? <br /> : null}</span>
        ))}
      </p>
    )
  })
}

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
          <div style={{
            fontSize: "13px",
            color: content.type === "error" ? "#DC2626" : "var(--text-1)",
            lineHeight: 1.6,
          }}>
            {content.type === "error" ? content.text : renderMarkdown(content.text)}
          </div>
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
          <p style={{ fontSize: "11px", color: "var(--text-3)", margin: 0, textTransform: "capitalize" }}>{content.task.status} · {content.task.priority} priority{content.task.due_date ? ` · due ${new Date(content.task.due_date).toLocaleDateString("en", { month: "short", day: "numeric" })}` : ""}</p>
        </div>
      </div>
    )
  }

  if (content.type === "entity_summary") {
    return (
      <div style={{ marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <span style={{ color: "var(--ai-accent)", display: "flex" }}><SparkleIcon /></span>
          <span style={{ fontSize: "12px", color: "var(--text-2)" }}>{content.entity}</span>
        </div>
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "10px 12px",
          marginBottom: content.relatedNotes.length > 0 ? "6px" : "0",
        }}>
          <div style={{ fontSize: "12px", color: "var(--text-1)", lineHeight: 1.6 }}>
            {renderMarkdown(content.summary)}
          </div>
        </div>
        {content.relatedNotes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            {content.relatedNotes.slice(0, 3).map((note) => (
              <Link
                key={note.id}
                href={`/notes?open=${note.id}`}
                style={{
                  display: "block",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  textDecoration: "none",
                  transition: "border-color 0.16s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)" }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)" }}
              >
                <p style={{ fontSize: "12px", color: "var(--text-1)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {note.content.replace(/\n/g, " ").slice(0, 70)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (content.type === "commands") {
    return (
      <div style={{ marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <span style={{ color: "var(--ai-accent)", display: "flex" }}><SparkleIcon /></span>
          <span style={{ fontSize: "12px", color: "var(--text-2)" }}>Available commands</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {content.commands.map((cmd) => (
            <div
              key={cmd.name}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "8px 12px",
              }}
            >
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ai-accent)", fontFamily: "monospace" }}>{cmd.name}</span>
              <span style={{ fontSize: "12px", color: "var(--text-2)", marginLeft: "8px" }}>{cmd.description}</span>
            </div>
          ))}
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
    addMessage({ role: "assistant", content: { type: "loading" } })

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      })
      const data = await res.json()

      switch (data.action) {
        case "task_created":
          updateLastAssistantMessage({ type: "task_created", task: data.task })
          break
        case "note_created":
          updateLastAssistantMessage({
            type: "text",
            text: `Note saved: "${data.note.content.slice(0, 60)}${data.note.content.length > 60 ? "…" : ""}"`,
          })
          break
        case "entity_summary":
          updateLastAssistantMessage({
            type: "entity_summary",
            entity: data.entity,
            summary: data.summary,
            relatedNotes: data.relatedNotes ?? [],
          })
          break
        case "answer":
          updateLastAssistantMessage({ type: "text", text: data.text })
          break
        case "commands":
          updateLastAssistantMessage({ type: "commands", commands: data.commands })
          break
        case "error":
        default:
          updateLastAssistantMessage({ type: "error", text: data.text ?? "Something went wrong." })
      }
    } catch {
      updateLastAssistantMessage({ type: "error", text: "Failed to reach the AI. Please try again." })
    }

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
              Ask questions, create tasks and notes,<br />or explore your knowledge graph.
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
