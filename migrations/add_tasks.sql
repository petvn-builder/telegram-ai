-- Tasks: action layer of the knowledge system
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'inbox'
    CHECK (status IN ('inbox', 'next', 'doing', 'waiting', 'done')),
  due_date TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high')),
  linked_note_id UUID REFERENCES knowledge(id) ON DELETE SET NULL,
  created_from TEXT NOT NULL DEFAULT 'manual'
    CHECK (created_from IN ('manual', 'note', 'telegram')),
  telegram_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_entities (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_linked_note_id ON tasks(linked_note_id);
CREATE INDEX IF NOT EXISTS idx_task_entities_entity_id ON task_entities(entity_id);
CREATE INDEX IF NOT EXISTS idx_task_entities_task_id ON task_entities(task_id);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_owner" ON tasks
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "task_entities_owner" ON task_entities
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.id = task_id
        AND tasks.user_id = auth.uid()
    )
  );
