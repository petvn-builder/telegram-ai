"use client"

import { createContext, useContext, useState, useCallback, useRef } from "react"

interface AiPanelContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  pendingCommand: string | null
  clearPendingCommand: () => void
  sendCommand: (command: string) => void
}

const AiPanelContext = createContext<AiPanelContextValue>({
  isOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
  pendingCommand: null,
  clearPendingCommand: () => {},
  sendCommand: () => {},
})

export function AiPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [pendingCommand, setPendingCommand] = useState<string | null>(null)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])
  const clearPendingCommand = useCallback(() => setPendingCommand(null), [])

  const sendCommand = useCallback((command: string) => {
    setIsOpen(true)
    setPendingCommand(command)
  }, [])

  return (
    <AiPanelContext.Provider value={{ isOpen, open, close, toggle, pendingCommand, clearPendingCommand, sendCommand }}>
      {children}
    </AiPanelContext.Provider>
  )
}

export function useAiPanel() {
  return useContext(AiPanelContext)
}
