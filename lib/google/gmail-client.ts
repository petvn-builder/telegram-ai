import { google, gmail_v1 } from "googleapis"
import { getAuthedClientForUser } from "./oauth"

export async function gmailFor(userId: string): Promise<gmail_v1.Gmail> {
  const auth = await getAuthedClientForUser(userId)
  return google.gmail({ version: "v1", auth })
}
