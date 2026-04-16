import { getEventsTool } from "./get-events"
import { createEventTool } from "./create-event"
import { updateEventTool } from "./update-event"
import { deleteEventTool } from "./delete-event"
import { findFreeTimeTool } from "./find-free-time"

export const calendarTools = [
  getEventsTool,
  createEventTool,
  updateEventTool,
  deleteEventTool,
  findFreeTimeTool,
]
