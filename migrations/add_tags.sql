-- Tags system: lightweight inline #tag support for notes
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS note_tags (
  note_id UUID NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

CREATE INDEX IF NOT EXISTS note_tags_note_id_idx ON note_tags(note_id);
CREATE INDEX IF NOT EXISTS note_tags_tag_id_idx ON note_tags(tag_id);
CREATE INDEX IF NOT EXISTS tags_user_id_idx ON tags(user_id);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tags_owner" ON tags FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "note_tags_owner" ON note_tags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tags
      WHERE tags.id = note_tags.tag_id AND tags.user_id = auth.uid()
    )
  );
