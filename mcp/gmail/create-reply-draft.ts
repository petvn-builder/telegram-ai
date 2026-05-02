import { z } from "zod"
import { defineTool } from "../tool-registry"
import { createReplyDraft } from "@/lib/google/gmail-send"
import { wrapGoogleError } from "../shared/errors"

const input = z.object({
  threadId: z
    .string()
    .min(1)
    .describe(
      "Gmail thread id of the email being replied to. Get it from search_emails or get_thread first."
    ),
  body: z.string().min(1).max(50_000).describe("Plain-text body of the reply."),
  to: z.email().optional().describe("Override recipient. Defaults to the sender of the latest message in the thread."),
  subject: z
    .string()
    .max(998)
    .optional()
    .describe('Override subject. Defaults to original subject prefixed with "Re: ".'),
})

export const createReplyDraftTool = defineTool({
  name: "create_reply_draft",
  description:
    "Create a Gmail draft reply on an existing thread (preserves In-Reply-To / References headers). Use this when the user asks to 'reply' or 'respond' to an email. Look up the threadId first via search_emails. The draft is NOT sent — the user reviews and sends it from Gmail.",
  inputSchema: input,
  handler: async (args, ctx): Promise<{ draftId: string; messageId: string; threadId: string; draftsUrl: string }> => {
    try {
      const res = await createReplyDraft({
        userId: ctx.userId,
        threadId: args.threadId,
        body: args.body,
        to: args.to,
        subject: args.subject,
      })
      return { ...res, draftsUrl: "https://mail.google.com/mail/u/0/#drafts" }
    } catch (e) {
      throw wrapGoogleError(e)
    }
  },
})
