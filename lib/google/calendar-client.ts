import { google, calendar_v3 } from "googleapis"
import { getAuthedClientForUser } from "./oauth"

export async function calendarFor(userId: string): Promise<calendar_v3.Calendar> {
  const auth = await getAuthedClientForUser(userId)
  return google.calendar({ version: "v3", auth })
}
