import { z } from "zod"
import { defineTool } from "../tool-registry"
import { gmailFor } from "@/lib/google/gmail-client"
import { normalizeEmail } from "@/lib/google/normalize"
import { wrapGoogleError } from "../shared/errors"
import type { NormalizedEmail } from "../shared/types"

const input = z.object({
  threadId: z.string().min(1),
  maxMessages: z.number().int().min(1).max(100).default(20),
})

export const getThreadTool = defineTool({
  name: "get_thread",
  description: "Fetch all messages in a Gmail thread. Returns the subject and an array of normalized messages in order.",
  inputSchema: input,
  handler: async (
    args,
    ctx
  ): Promise<{ threadId: string; subject: string; messages: NormalizedEmail[] }> => {
    const gmail = await gmailFor(ctx.userId)
    try {
      const res = await gmail.users.threads.get({
        userId: "me",
        id: args.threadId,
        format: "full",
      })
      const rawMessages = (res.data.messages ?? []).slice(0, args.maxMessages)
      const messages = rawMessages.map(normalizeEmail)
      return {
        threadId: args.threadId,
        subject: messages[0]?.subject ?? "",
        messages,
      }
    } catch (e) {
      throw wrapGoogleError(e)
    }
  },
})
