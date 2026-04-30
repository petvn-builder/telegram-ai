import { gmailFor } from "./gmail-client"

export type SendReplyArgs = {
  userId: string
  threadId: string
  body: string
  subject?: string
  to?: string
  cc?: string[]
}

export type SendReplyResult = {
  messageId: string
  threadId: string
}

function header(name: string, headers: { name?: string | null; value?: string | null }[] | undefined): string | null {
  if (!headers) return null
  const h = headers.find((x) => x.name?.toLowerCase() === name.toLowerCase())
  return h?.value ?? null
}

function ensureRePrefix(subject: string): string {
  return /^re:\s/i.test(subject) ? subject : `Re: ${subject}`
}

function encodeHeader(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value
  const b64 = Buffer.from(value, "utf-8").toString("base64")
  return `=?UTF-8?B?${b64}?=`
}

function buildRfc2822(args: {
  to: string
  from?: string
  subject: string
  body: string
  inReplyTo?: string
  references?: string
  cc?: string[]
}): string {
  const lines: string[] = []
  lines.push(`To: ${args.to}`)
  if (args.cc && args.cc.length > 0) lines.push(`Cc: ${args.cc.join(", ")}`)
  lines.push(`Subject: ${encodeHeader(args.subject)}`)
  if (args.inReplyTo) lines.push(`In-Reply-To: ${args.inReplyTo}`)
  if (args.references) lines.push(`References: ${args.references}`)
  lines.push("MIME-Version: 1.0")
  lines.push('Content-Type: text/plain; charset="UTF-8"')
  lines.push("Content-Transfer-Encoding: 7bit")
  lines.push("")
  lines.push(args.body)
  return lines.join("\r\n")
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

export async function sendReply(args: SendReplyArgs): Promise<SendReplyResult> {
  const gmail = await gmailFor(args.userId)

  // Fetch the latest message in the thread to grab Message-Id + headers for threading.
  const thread = await gmail.users.threads.get({
    userId: "me",
    id: args.threadId,
    format: "metadata",
    metadataHeaders: ["Message-ID", "Message-Id", "Subject", "From", "To", "References"],
  })
  const messages = thread.data.messages ?? []
  if (messages.length === 0) throw new Error("Thread has no messages")
  const last = messages[messages.length - 1]
  const headers = last.payload?.headers ?? undefined

  const messageId = header("Message-Id", headers) ?? header("Message-ID", headers)
  const refs = header("References", headers)
  const lastSubject = header("Subject", headers) ?? args.subject ?? ""
  const lastFrom = header("From", headers) ?? ""

  const subject = ensureRePrefix(args.subject ?? lastSubject)
  const to = args.to ?? lastFrom
  if (!to) throw new Error("No recipient could be resolved for the reply")

  const references = [refs, messageId].filter(Boolean).join(" ").trim() || undefined

  const raw = buildRfc2822({
    to,
    subject,
    body: args.body,
    inReplyTo: messageId ?? undefined,
    references,
    cc: args.cc,
  })

  const sent = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: base64UrlEncode(raw),
      threadId: args.threadId,
    },
  })

  return {
    messageId: sent.data.id ?? "",
    threadId: sent.data.threadId ?? args.threadId,
  }
}
