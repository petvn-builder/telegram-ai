"use client"

import { useState, useEffect, useMemo, useCallback } from "react"

// ── Types ──────────────────────────────────────────────────────────────────────

type CalTask = {
  id: string
  title: string
  status: string
  due_date: string | null
}

type ViewMonth = { year: number; month: number } // month: 0-based

// ── Helpers ────────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function toMonthParam(vm: ViewMonth): string {
  return `${vm.year}-${String(vm.month + 1).padStart(2, "0")}`
}

function monthLabel(vm: ViewMonth): string {
  return new Date(vm.year, vm.month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function firstWeekday(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

function prevMonth(vm: ViewMonth): ViewMonth {
  if (vm.month === 0) return { year: vm.year - 1, month: 11 }
  return { year: vm.year, month: vm.month - 1 }
}

function nextMonth(vm: ViewMonth): ViewMonth {
  if (vm.month === 11) return { year: vm.year + 1, month: 0 }
  return { year: vm.year, month: vm.month + 1 }
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

// ── MonthNavigator ─────────────────────────────────────────────────────────────

function MonthNavigator({
  vm,
  onPrev,
  onNext,
}: {
  vm: ViewMonth
  onPrev: () => void
  onNext: () => void
}) {
  const btnStyle: React.CSSProperties = {
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 7,
    cursor: "pointer",
    color: "var(--text-2)",
    fontSize: 14,
    transition: "background 150ms ease-in-out, border-color 150ms ease-in-out",
    flexShrink: 0,
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
      <button
        onClick={onPrev}
        style={btnStyle}
        onMouseEnter={e => {
          ;(e.currentTarget as HTMLButtonElement).style.background = "var(--bg-elevated)"
          ;(e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-hover)"
        }}
        onMouseLeave={e => {
          ;(e.currentTarget as HTMLButtonElement).style.background = "transparent"
          ;(e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"
        }}
        aria-label="Previous month"
      >
        ‹
      </button>
      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", letterSpacing: "-0.01em" }}>
        {monthLabel(vm)}
      </span>
      <button
        onClick={onNext}
        style={btnStyle}
        onMouseEnter={e => {
          ;(e.currentTarget as HTMLButtonElement).style.background = "var(--bg-elevated)"
          ;(e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-hover)"
        }}
        onMouseLeave={e => {
          ;(e.currentTarget as HTMLButtonElement).style.background = "transparent"
          ;(e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"
        }}
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  )
}

// ── CalendarGrid ───────────────────────────────────────────────────────────────

function CalendarGrid({
  vm,
  selectedDate,
  datesWithTasks,
  onSelect,
}: {
  vm: ViewMonth
  selectedDate: string
  datesWithTasks: Set<string>
  onSelect: (date: string) => void
}) {
  const today = toDateStr(new Date())
  const days = daysInMonth(vm.year, vm.month)
  const offset = firstWeekday(vm.year, vm.month)
  const cells = offset + days

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Weekday headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
        {WEEKDAYS.map(d => (
          <div
            key={d}
            style={{
              textAlign: "center",
              fontSize: 11,
              fontWeight: 500,
              color: "var(--text-3)",
              paddingBottom: 6,
              letterSpacing: "0.03em",
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {Array.from({ length: Math.ceil(cells / 7) * 7 }).map((_, i) => {
          const day = i - offset + 1
          const inMonth = day >= 1 && day <= days
          if (!inMonth) {
            return <div key={i} />
          }

          const dateStr = `${vm.year}-${String(vm.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
          const isSelected = dateStr === selectedDate
          const isToday = dateStr === today
          const hasTasks = datesWithTasks.has(dateStr)

          let cellBg = "transparent"
          let cellColor = "var(--text-1)"
          let fontWeight: number | string = 400

          if (isSelected) {
            cellBg = "var(--accent)"
            cellColor = "#ffffff"
            fontWeight = 600
          } else if (isToday) {
            cellBg = "var(--bg-elevated)"
            fontWeight = 600
          }

          return (
            <button
              key={i}
              onClick={() => onSelect(dateStr)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "5px 2px 4px",
                background: cellBg,
                color: cellColor,
                fontWeight,
                fontSize: 13,
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                transition: "background 150ms ease-in-out",
                minHeight: 34,
                gap: 2,
                outline: "none",
              }}
              onMouseEnter={e => {
                if (!isSelected) {
                  ;(e.currentTarget as HTMLButtonElement).style.background = "var(--bg-elevated)"
                }
              }}
              onMouseLeave={e => {
                if (!isSelected) {
                  ;(e.currentTarget as HTMLButtonElement).style.background = cellBg
                }
              }}
              aria-label={dateStr}
              aria-pressed={isSelected}
            >
              {day}
              {hasTasks && (
                <div
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: isSelected ? "rgba(255,255,255,0.7)" : "var(--accent)",
                    flexShrink: 0,
                  }}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── TaskListForSelectedDate ────────────────────────────────────────────────────

function TaskListForSelectedDate({
  date,
  tasks,
  loading,
  onToggle,
}: {
  date: string
  tasks: CalTask[]
  loading: boolean
  onToggle: (id: string, isDone: boolean) => void
}) {
  const displayDate = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })

  return (
    <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 16 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 2 }}>
            Linked goals &amp; tasks
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>{displayDate}</div>
        </div>
        <a
          href={`/tasks?create=1`}
          style={{
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text-2)",
            fontSize: 16,
            textDecoration: "none",
            lineHeight: 1,
            transition: "background 150ms, border-color 150ms",
            flexShrink: 0,
          }}
          onMouseEnter={e => {
            ;(e.currentTarget as HTMLAnchorElement).style.background = "var(--bg-elevated)"
            ;(e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border-hover)"
          }}
          onMouseLeave={e => {
            ;(e.currentTarget as HTMLAnchorElement).style.background = "transparent"
            ;(e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border)"
          }}
          title="Create new task"
        >
          +
        </a>
      </div>

      {/* Task list */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2].map(i => (
            <div key={i} className="skeleton" style={{ height: 36, borderRadius: 8 }} />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-3)", fontSize: 13 }}>
          No tasks for this day
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {tasks.map(task => {
            const isDone = task.status === "done"
            return (
              <div
                key={task.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "7px 8px",
                  borderRadius: 8,
                  opacity: isDone ? 0.45 : 1,
                  transition: "opacity 180ms ease-in-out",
                }}
              >
                <button
                  onClick={() => onToggle(task.id, isDone)}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    border: isDone ? "none" : "1.5px solid var(--border-hover)",
                    background: isDone ? "var(--accent)" : "transparent",
                    cursor: "pointer",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                    transition: "background 150ms, border-color 150ms",
                  }}
                  aria-label={isDone ? "Mark incomplete" : "Mark complete"}
                >
                  {isDone && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-1)",
                    textDecoration: isDone ? "line-through" : "none",
                    flex: 1,
                    lineHeight: 1.4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {task.title}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── CalendarSidebar (main export) ──────────────────────────────────────────────

export default function CalendarSidebar() {
  const todayStr = toDateStr(new Date())

  const [vm, setVm] = useState<ViewMonth>(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [selectedDate, setSelectedDate] = useState<string>(todayStr)
  const [tasks, setTasks] = useState<CalTask[]>([])
  const [loading, setLoading] = useState(false)

  // Fetch tasks for current view month
  useEffect(() => {
    let cancelled = false
    setLoading(true)

    fetch(`/api/tasks?month=${toMonthParam(vm)}`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled) setTasks(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!cancelled) setTasks([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [vm])

  // When month changes, if selectedDate is outside the new month, reset to today (or 1st of month)
  useEffect(() => {
    const selYear = parseInt(selectedDate.slice(0, 4))
    const selMonth = parseInt(selectedDate.slice(5, 7)) - 1
    if (selYear !== vm.year || selMonth !== vm.month) {
      // Keep today selected if it's in the view month, else first day
      const d = new Date()
      if (d.getFullYear() === vm.year && d.getMonth() === vm.month) {
        setSelectedDate(todayStr)
      } else {
        setSelectedDate(`${vm.year}-${String(vm.month + 1).padStart(2, "0")}-01`)
      }
    }
  }, [vm, todayStr, selectedDate])

  const datesWithTasks = useMemo(
    () => new Set(tasks.filter(t => t.due_date).map(t => t.due_date!.slice(0, 10))),
    [tasks]
  )

  const selectedTasks = useMemo(
    () => tasks.filter(t => t.due_date?.slice(0, 10) === selectedDate),
    [tasks, selectedDate]
  )

  const handleToggle = useCallback(async (id: string, isDone: boolean) => {
    const newStatus = isDone ? "inbox" : "done"
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t))
    try {
      await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
    } catch {
      // Revert on error
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: isDone ? "done" : "inbox" } : t))
    }
  }, [])

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: "20px",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <MonthNavigator
        vm={vm}
        onPrev={() => setVm(prevMonth(vm))}
        onNext={() => setVm(nextMonth(vm))}
      />
      <CalendarGrid
        vm={vm}
        selectedDate={selectedDate}
        datesWithTasks={datesWithTasks}
        onSelect={setSelectedDate}
      />
      <TaskListForSelectedDate
        date={selectedDate}
        tasks={selectedTasks}
        loading={loading}
        onToggle={handleToggle}
      />
    </div>
  )
}
