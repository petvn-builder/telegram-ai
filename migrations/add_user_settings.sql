-- User preferences: tone / response style
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tone       text NOT NULL DEFAULT 'professional',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own settings"
  ON public.user_settings
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
