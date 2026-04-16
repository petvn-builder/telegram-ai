import { z } from "zod"
import { defineTool } from "../tool-registry"
import { gmailFor } from "@/lib/google/gmail-client"
import { normalizeEmail } from "@/lib/google/normalize"
import { wrapGoogleError } from "../shared/errors"
import type { NormalizedEmail } from "../shared/types"

const input = z.object({
  messageId: z.string().min(1),
})

export const getEmailTool = defineTool({
  name: "get_email",
  description: "Fetch a single Gmail message by id. Returns subject, sender, timestamp, and cleaned plain-text body.",
  inputSchema: input,
  handler: async (args, ctx): Promise<NormalizedEmail> => {
    const gmail = await gmailFor(ctx.userId)
    try {
      const res = await gmail.users.messages.get({
        userId: "me",
        id: args.messageId,
        format: "full",
      })
      return normalizeEmail(res.data)
    } catch (e) {
      throw wrapGoogleError(e)
    }
  },
})
