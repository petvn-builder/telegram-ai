"use client"

import { useEffect, useState, useRef } from "react"
import dynamic from "next/dynamic"
import * as d3 from "d3-force"

const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d"),
  { ssr: false }
)

export default function GraphPage() {
  const [data, setData] = useState<any>(null)
  const [selectedNote, setSelectedNote] = useState<any>(null)
  const [loadingNote, setLoadingNote] = useState(false)

  const [hoveredNote, setHoveredNote] = useState<any>(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })

  const fgRef = useRef<any>(null)

  // Fetch graph
  useEffect(() => {
    fetch("/api/graph?userId=1264094635")
      .then(res => res.json())
      .then(setData)
      .catch(err => console.error("Graph fetch failed:", err))
  }, [])

  // Configure physics + auto zoom
  useEffect(() => {
    if (!data || !fgRef.current) return

    const fg = fgRef.current

    fg.d3Force("charge")?.strength(-400)
    fg.d3Force("link")?.distance(160)

    fg.d3Force(
      "collision",
      d3.forceCollide((node: any) =>
        Math.sqrt(node.size || 1) * 10
      )
    )

    setTimeout(() => {
      fg.zoomToFit(400, 80)
    }, 300)

  }, [data])

  if (!data) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "18px"
        }}
      >
        Loading graph...
      </div>
    )
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "grid",
        gridTemplateColumns: "1fr 420px",
        background: "#f5f7fa",
        position: "relative"
      }}
    >
      {/* LEFT SIDE — GRAPH */}
      <div>
        <ForceGraph2D
          ref={fgRef}
          graphData={data}
          nodeAutoColorBy="type"
          backgroundColor="#ffffff"
          nodeVal={(node: any) => Math.sqrt(node.size || 1)}
          nodeRelSize={4}
          linkWidth={(link: any) => (link.weight || 1) * 0.5}
          linkDirectionalParticles={2}
          linkDirectionalParticleSpeed={0.005}
          cooldownTicks={100}
          d3VelocityDecay={0.3}
          nodeCanvasObjectMode={() => "after"}

          nodeCanvasObject={(node: any, ctx, globalScale) => {
            if (node.type !== "entity") return

            const label = node.label || node.id
            const fontSize = 14 / globalScale

            ctx.font = `${fontSize}px Sans-Serif`
            ctx.fillStyle = "#111"
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillText(label, node.x, node.y)
          }}

          // 🔥 HOVER POPUP LOGIC
          onNodeHover={async (node: any) => {
            if (!node || node.type !== "note") {
              setHoveredNote(null)
              return
            }

            // Track cursor
            const moveListener = (e: MouseEvent) => {
              setHoverPos({ x: e.clientX, y: e.clientY })
            }

            window.addEventListener("mousemove", moveListener)

            // Cleanup when hover ends
            if (!node) {
              window.removeEventListener("mousemove", moveListener)
            }

            // If content already exists in graph data
            if (node.content) {
              setHoveredNote(node)
              return
            }

            // Otherwise fetch it
            try {
              const res = await fetch(`/api/note?id=${node.id}`)
              if (!res.ok) return

              const noteData = await res.json()
              node.content = noteData.content // cache
              setHoveredNote(node)
            } catch (err) {
              console.error("Hover load failed:", err)
            }
          }}

          // 🔥 CLICK STILL WORKS
          onNodeClick={async (node: any) => {
            if (node.type !== "note") return

            setLoadingNote(true)
            setSelectedNote(null)

            try {
              const res = await fetch(`/api/note?id=${node.id}`)
              if (!res.ok) throw new Error(`HTTP ${res.status}`)

              const noteData = await res.json()
              setSelectedNote(noteData)
            } catch (err) {
              console.error("Failed to load note:", err)
            } finally {
              setLoadingNote(false)
            }
          }}
        />
      </div>

      {/* RIGHT SIDE — NOTE PANEL */}
      <div
        style={{
          background: "white",
          borderLeft: "1px solid #e5e7eb",
          padding: "28px",
          overflowY: "auto",
          boxShadow: "-4px 0 12px rgba(0,0,0,0.04)"
        }}
      >
        <h2
          style={{
            marginTop: 0,
            fontSize: "20px",
            fontWeight: 600,
            color: "#111827"
          }}
        >
          Note Viewer
        </h2>

        {loadingNote && <p>Loading note...</p>}

        {!loadingNote && selectedNote && (
          <>
            <h3>Note</h3>
            <div
              style={{
                background: "#f9fafb",
                padding: "16px",
                borderRadius: "12px",
                fontSize: "15px",
                lineHeight: 1.6,
                marginBottom: "24px",
                whiteSpace: "pre-wrap"
              }}
            >
              {selectedNote.content}
            </div>

            <h4>Linked Entities</h4>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px"
              }}
            >
              {selectedNote.relatedEntities?.map((entity: any) => (
                <div
                  key={entity.id}
                  onClick={() => {
                    const found = data.nodes.find(
                      (n: any) => n.id === entity.id
                    )

                    if (found && fgRef.current) {
                      fgRef.current.centerAt(found.x, found.y, 1000)
                      fgRef.current.zoom(3, 1000)
                    }
                  }}
                  style={{
                    padding: "6px 12px",
                    background: "#eef2ff",
                    borderRadius: "999px",
                    fontSize: "13px",
                    cursor: "pointer",
                    color: "#4338ca",
                    fontWeight: 500
                  }}
                >
                  {entity.name}
                </div>
              ))}
            </div>
          </>
        )}

        {!loadingNote && !selectedNote && (
          <p style={{ color: "#6b7280" }}>
            Click a note node in the graph to view its content.
          </p>
        )}
      </div>

      {/* 🔥 FLOATING HOVER POPUP */}
      {hoveredNote && (
        <div
          style={{
            position: "fixed",
            top: hoverPos.y + 15,
            left: hoverPos.x + 15,
            background: "white",
            padding: "16px",
            borderRadius: "12px",
            boxShadow: "0 15px 40px rgba(0,0,0,0.15)",
            maxWidth: "350px",
            fontSize: "14px",
            lineHeight: 1.6,
            zIndex: 1000,
            pointerEvents: "none",
            whiteSpace: "pre-wrap",
            border: "1px solid #e5e7eb"
          }}
        >
          {hoveredNote.content || "Loading..."}
        </div>
      )}
    </div>
  )
}
