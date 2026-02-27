-- Spaces: soft collection system for notes
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS spaces (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS note_spaces (
  note_id UUID NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, space_id)
);

CREATE INDEX IF NOT EXISTS idx_note_spaces_space_id ON note_spaces(space_id);
CREATE INDEX IF NOT EXISTS idx_note_spaces_note_id ON note_spaces(note_id);
CREATE INDEX IF NOT EXISTS idx_spaces_user_id ON spaces(user_id);

ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_spaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spaces_owner" ON spaces
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "note_spaces_owner" ON note_spaces
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM spaces
      WHERE spaces.id = space_id
        AND spaces.user_id = auth.uid()
    )
  );
