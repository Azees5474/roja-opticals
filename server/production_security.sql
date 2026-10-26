-- Apply in Supabase before production. Give shop users an app_metadata.role of
-- "owner" or "staff" using the Supabase Admin API; do not use user_metadata.
CREATE OR REPLACE FUNCTION public.is_roja_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('owner', 'staff');
$$;

CREATE TABLE IF NOT EXISTS public.shop_settings (
  id uuid PRIMARY KEY,
  shop jsonb NOT NULL DEFAULT '{}'::jsonb,
  notifications jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Browser clients may only access records when their server-controlled role is valid.
-- The API's service-role key bypasses RLS, so Express performs the same role check.
DO $$
DECLARE table_name text;
DECLARE policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['customers','prescriptions','followups','billing','orders','inventory','whatsapp_messages','whatsapp_settings','sheets_sync_log','shop_settings']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    -- Policies are permissive by default and combine with OR. Remove all old
    -- policies so an earlier "authenticated users can do everything" rule
    -- cannot silently defeat this production restriction.
    FOR policy_name IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = table_name LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_name);
    END LOOP;
    EXECUTE format('CREATE POLICY roja_staff_only ON public.%I FOR ALL TO authenticated USING (public.is_roja_staff()) WITH CHECK (public.is_roja_staff())', table_name);
  END LOOP;
END $$;
