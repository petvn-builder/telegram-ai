import { google, tasks_v1 } from "googleapis"
import { getAuthedClientForUser } from "./oauth"

export async function tasksFor(userId: string): Promise<tasks_v1.Tasks> {
  const auth = await getAuthedClientForUser(userId)
  return google.tasks({ version: "v1", auth })
}
