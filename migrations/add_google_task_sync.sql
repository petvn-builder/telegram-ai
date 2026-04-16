-- Google Tasks sync: link local tasks to Google Tasks
ALTER TABLE tasks ADD COLUMN google_task_id TEXT;
ALTER TABLE tasks ADD COLUMN google_task_list_id TEXT DEFAULT '@default';

-- Unique index: one Google Task per user (allows NULL google_task_id for unsynced tasks)
CREATE UNIQUE INDEX idx_tasks_google_task_id
  ON tasks (user_id, google_task_id)
  WHERE google_task_id IS NOT NULL;
