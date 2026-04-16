-- Per-user Google OAuth credentials (Calendar + Gmail).
-- Tokens are encrypted at rest by the application (AES-256-GCM).
-- Only the service role (admin client) writes; users may read their own row.

CREATE TABLE IF NOT EXISTS public.user_google_credentials (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email  text,
  access_token  text NOT NULL,   -- AES-GCM ciphertext, base64 (iv:tag:ct)
  refresh_token text NOT NULL,   -- AES-GCM ciphertext, base64 (iv:tag:ct)
  scopes        text[] NOT NULL DEFAULT '{}',
  expiry        timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_google_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own google creds" ON public.user_google_credentials;
CREATE POLICY "users read own google creds"
  ON public.user_google_credentials FOR SELECT
  USING (auth.uid() = user_id);
-- No insert/update/delete policy: only service role writes.
