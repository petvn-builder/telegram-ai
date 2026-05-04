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
    "Search the user's personal knowledge base — notes, entities (people/projects), decisions, and past conversations — and return a synthesized answer with source previews. CALL THIS for any question that references the user's own life, work, people, projects, plans, or past, even if the question seems answerable from general knowledge. This is the user's memory; you don't have it natively. Do NOT use for live calendar, email, or task data — use the dedicated tools for those.",
  inputSchema: input,
  handler: async (args, ctx): Promise<{ answer: string; sources: Array<{ id: string; preview: string }> }> => {
    const { semanticSearch } = await import("@/lib/ai-search")
    const { text, sources } = await semanticSearch(ctx.userId, args.query)
    return { answer: text, sources }
  },
})
