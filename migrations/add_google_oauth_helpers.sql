-- Helper: look up a user in auth.users by email
-- Used by the OAuth callback to detect existing accounts before linking.
-- SECURITY DEFINER so it can access the auth schema.
CREATE OR REPLACE FUNCTION public.get_auth_user_by_email(p_email text)
RETURNS TABLE(
  id uuid,
  email text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql AS $$
  SELECT id, email, email_confirmed_at, raw_app_meta_data
  FROM auth.users
  WHERE email = p_email;
$$;

-- Restrict execution: only the service role (server-side admin client) may call this.
REVOKE ALL ON FUNCTION public.get_auth_user_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_user_by_email(text) TO service_role;
