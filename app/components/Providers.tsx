"use client"

import { AiPanelProvider } from "./AiPanelContext"

export default function Providers({ children }: { children: React.ReactNode }) {
  return <AiPanelProvider>{children}</AiPanelProvider>
}
