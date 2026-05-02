import { searchEmailsTool } from "./search-emails"
import { getEmailTool } from "./get-email"
import { getThreadTool } from "./get-thread"
import { createDraftTool } from "./create-draft"
import { createReplyDraftTool } from "./create-reply-draft"

export const gmailTools = [
  searchEmailsTool,
  getEmailTool,
  getThreadTool,
  createDraftTool,
  createReplyDraftTool,
]
