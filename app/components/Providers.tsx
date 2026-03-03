"use client"

import { AiPanelProvider } from "./AiPanelContext"
import { SidebarProvider } from "./SidebarContext"

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AiPanelProvider>{children}</AiPanelProvider>
    </SidebarProvider>
  )
}
