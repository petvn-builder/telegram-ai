import { z } from "zod"
import { defineTool } from "../tool-registry"
import { createEmailDraft } from "@/lib/google/gmail-send"
import { wrapGoogleError } from "../shared/errors"

const input = z.object({
  to: z.email().describe("Recipient email address."),
  subject: z.string().min(1).max(998).describe("Subject line."),
  body: z.string().min(1).max(50_000).describe("Plain-text body of the email."),
  cc: z.array(z.email()).max(50).optional().describe("Optional CC recipients."),
})

export const createDraftTool = defineTool({
  name: "create_email_draft",
  description:
    "Create a new Gmail draft (compose) saved to the user's Drafts folder. Use this when the user asks to 'send/draft/write an email to <recipient>' that is NOT a reply to an existing thread. The draft is NOT sent — the user reviews and sends it from Gmail.",
  inputSchema: input,
  handler: async (args, ctx): Promise<{ draftId: string; messageId: string; draftsUrl: string }> => {
    try {
      const res = await createEmailDraft({
        userId: ctx.userId,
        to: args.to,
        subject: args.subject,
        body: args.body,
        cc: args.cc,
      })
      return { ...res, draftsUrl: "https://mail.google.com/mail/u/0/#drafts" }
    } catch (e) {
      throw wrapGoogleError(e)
    }
  },
})
