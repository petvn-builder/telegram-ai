-- RLS Policies for tables managed by authenticated users
-- Run this in the Supabase dashboard SQL editor after enabling RLS on all 5 tables.

-- entities: authenticated users can only access their own rows
CREATE POLICY "users_own_entities"
  ON public.entities
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- knowledge: authenticated users can only access their own rows
CREATE POLICY "users_own_knowledge"
  ON public.knowledge
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- knowledge_links: authenticated users can only access their own rows
CREATE POLICY "users_own_knowledge_links"
  ON public.knowledge_links
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- notes: authenticated users can only access their own rows
CREATE POLICY "users_own_notes"
  ON public.notes
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- public.users (Telegram bot user tracking table):
-- No policies needed. Only the Telegram bot accesses this table via the
-- service role key, which bypasses RLS entirely.
-- RLS enabled + no policies = anon/authenticated access blocked (correct behaviour).
