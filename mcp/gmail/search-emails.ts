import { z } from "zod"
import { defineTool } from "../tool-registry"
import { gmailFor } from "@/lib/google/gmail-client"
import { normalizeEmailSummary } from "@/lib/google/normalize"
import { wrapGoogleError } from "../shared/errors"
import type { NormalizedEmailSummary } from "../shared/types"

const input = z.object({
  query: z
    .string()
    .describe('Gmail search syntax (e.g. "from:alice@x.com newer_than:7d is:unread"). Use this to filter.'),
  maxResults: z.number().int().min(1).max(50).default(10),
})

export const searchEmailsTool = defineTool({
  name: "search_emails",
  description: "Search Gmail using standard search operators. Returns normalized message summaries (no full body).",
  inputSchema: input,
  handler: async (args, ctx): Promise<{ messages: NormalizedEmailSummary[] }> => {
    const gmail = await gmailFor(ctx.userId)
    try {
      const list = await gmail.users.messages.list({
        userId: "me",
        q: args.query,
        maxResults: args.maxResults,
      })
      const ids = (list.data.messages ?? []).map((m) => m.id!).filter(Boolean)
      if (ids.length === 0) return { messages: [] }

      const fetched = await Promise.all(
        ids.map((id) =>
          gmail.users.messages.get({
            userId: "me",
            id,
            format: "metadata",
            metadataHeaders: ["From", "To", "Subject", "Date"],
          })
        )
      )
      return { messages: fetched.map((r) => normalizeEmailSummary(r.data)) }
    } catch (e) {
      throw wrapGoogleError(e)
    }
  },
})
