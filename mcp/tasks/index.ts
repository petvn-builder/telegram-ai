import { createTaskTool } from "./create-task"
import { listTasksTool } from "./list-tasks"
import { updateTaskTool } from "./update-task"
import { deleteTaskTool } from "./delete-task"

export const tasksTools = [createTaskTool, listTasksTool, updateTaskTool, deleteTaskTool]
