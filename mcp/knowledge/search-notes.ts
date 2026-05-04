import { z } from "zod"
import { defineTool } from "../tool-registry"

const input = z.object({
  query: z
    .string()
    .min(1)
    .max(500)
    .describe(
      "Natural-language question to answer from the user's saved notes, entities (people/projects), and past decisions."
    ),
})

export const searchNotesTool = defineTool({
  name: "search_notes",
  description:
    "Retrieve raw excerpts from the user's personal knowledge base — notes, entities (people/projects), decisions, and past conversations. Returns the matching note text and source previews; YOU must read the excerpts and answer from them. CALL THIS for any question that references the user's own life, work, people, projects, plans, or past, even if it seems answerable from general knowledge. This is the user's memory; you don't have it natively. After calling: quote/paraphrase from the returned context and ground every claim in it. If the context doesn't cover the question, say so explicitly — do NOT fill gaps with general knowledge. Do NOT use for live calendar, email, or task data — use the dedicated tools for those.",
  inputSchema: input,
  handler: async (
    args,
    ctx
  ): Promise<{ context: string; sources: Array<{ id: string; preview: string }> }> => {
    const { buildKnowledgeContext } = await import("@/lib/ai-search")
    const { memory, sources } = await buildKnowledgeContext(ctx.userId, args.query)
    return {
      context: memory || "(no relevant notes found)",
      sources,
    }
  },
})
