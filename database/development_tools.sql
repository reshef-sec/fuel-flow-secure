-- Run in the EXTERNAL application database's SQL Editor as its trusted owner.
-- Installation ONLY: this script does NOT reset data or generate test records.
-- Back up your transactional data first. Never run maintenance during active use.
-- Authorization is pinned once to Maya's immutable profile UUID, NOT her name on every call.
-- Exactly one admin profile named Maya must exist; ambiguity aborts installation.
BEGIN;

CREATE TABLE IF NOT EXISTS public.development_tools_owner (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  user_id uuid NOT NULL UNIQUE
);
REVOKE ALL ON public.development_tools_owner FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.development_tools_owner TO service_role;
ALTER TABLE public.development_tools_owner ENABLE ROW LEVEL SECURITY;
-- No client policies: only the trusted installer can change this binding.

DO $$
DECLARE candidates uuid[]; bound_id uuid;
BEGIN
  SELECT array_agg(p.id) INTO candidates FROM public.profiles p
  WHERE regexp_replace(trim(p.full_name), '\s+', ' ', 'g') IN ('מאיה קורן', 'קורן מאיה')
    AND public.has_role(p.id, 'admin'::public.app_role);
  IF coalesce(cardinality(candidates), 0) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one verified Maya Koren admin profile. Inspect profiles and user_roles before installing.';
  END IF;
  SELECT user_id INTO bound_id FROM public.development_tools_owner WHERE singleton;
  IF bound_id IS NOT NULL AND bound_id IS DISTINCT FROM candidates[1] THEN
    RAISE EXCEPTION 'Existing owner binding differs. Refusing to reassign maintenance ownership.';
  END IF;
  INSERT INTO public.development_tools_owner(singleton, user_id) VALUES (true, candidates[1])
    ON CONFLICT (singleton) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.can_use_development_tools()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.development_tools_owner WHERE singleton AND user_id = auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role);
$$;
REVOKE ALL ON FUNCTION public.can_use_development_tools() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_use_development_tools() TO authenticated;

-- Fixed allowlist ONLY, never caller-supplied table names; no CASCADE.
-- Locks all known transactional tables together for atomic maintenance.
CREATE OR REPLACE FUNCTION public.lock_development_transactions()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE t text; targets text := '';
BEGIN
  IF NOT public.can_use_development_tools() THEN RAISE EXCEPTION 'אין הרשאה לכלי פיתוח ובדיקות' USING ERRCODE = '42501'; END IF;
  FOREACH t IN ARRAY ARRAY[
    'activity_log', 'allocations', 'import_batches', 'import_history', 'notifications',
    'signatures_archive', 'transactions', 'voucher_allocations', 'voucher_codes',
    'voucher_requests', 'vouchers', 'worker_links'
  ] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      targets := targets || CASE WHEN targets = '' THEN '' ELSE ', ' END || format('public.%I', t);
    END IF;
  END LOOP;
  IF targets = '' THEN RAISE EXCEPTION 'לא נמצאו טבלאות פעילות'; END IF;
  EXECUTE 'LOCK TABLE ' || targets || ' IN ACCESS EXCLUSIVE MODE';
  RETURN targets;
END $$;
REVOKE ALL ON FUNCTION public.lock_development_transactions() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reset_development_data(p_confirmation text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE targets text;
BEGIN
  IF NOT public.can_use_development_tools() THEN RAISE EXCEPTION 'אין הרשאה לכלי פיתוח ובדיקות' USING ERRCODE = '42501'; END IF;
  IF p_confirmation IS DISTINCT FROM 'איפוס וניקוי נתונים' THEN RAISE EXCEPTION 'נדרש אישור מפורש למחיקה'; END IF;
  targets := public.lock_development_transactions();
  -- RESTRICT is deliberate: unknown foreign keys abort everything; never erase master data via CASCADE.
  EXECUTE 'TRUNCATE TABLE ' || targets || ' RESTART IDENTITY RESTRICT';
  UPDATE public.app_settings SET balance = 0, updated_at = now() WHERE key = 'main';
  -- Preserve profiles, user_roles, app_users, branches, clients, reasons and owner binding.
  -- No activity entry is inserted after reset: transactional tables remain at zero.
  -- Stored PDF/CSV files and storage objects are NOT deleted by this database reset.
END $$;
REVOKE ALL ON FUNCTION public.reset_development_data(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_development_data(text) TO authenticated;

-- Disable the legacy name-authorized reset entrypoint; callers must use the new confirmation RPC.
CREATE OR REPLACE FUNCTION public.reset_demo_data()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ BEGIN RAISE EXCEPTION 'Use reset_development_data with explicit confirmation'; END $$;
REVOKE ALL ON FUNCTION public.reset_demo_data() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.generate_demo_data()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE targets text; pool text; fuel text; i integer; n integer := 0; batch text := gen_random_uuid()::text;
  t text; populated boolean;
BEGIN
  IF NOT public.can_use_development_tools() THEN RAISE EXCEPTION 'אין הרשאה לכלי פיתוח ובדיקות' USING ERRCODE = '42501'; END IF;
  targets := public.lock_development_transactions();
  -- Do not mix synthetic inventory into an operational system or silently overwrite records.
  FOREACH t IN ARRAY ARRAY['vouchers', 'voucher_codes', 'worker_links', 'voucher_requests', 'allocations', 'voucher_allocations', 'transactions', 'signatures_archive'] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I)', t) INTO populated;
      IF populated THEN RAISE EXCEPTION 'טעינת הדגמה אפשרית רק כשנתוני הפעילות ריקים'; END IF;
    END IF;
  END LOOP;
  -- Literal central pool identifier is preserved for existing RPC authorization/queries.
  -- Existing real branch names only; no synthetic people, branches, clients or roles.
  FOR pool IN SELECT 'מאגר ראשי' UNION SELECT DISTINCT name FROM public.branches WHERE nullif(trim(name), '') IS NOT NULL LOOP
    FOREACH fuel IN ARRAY ARRAY['בנזין', 'סולר'] LOOP
      FOR i IN 1..10 LOOP
        n := n + 1;
        INSERT INTO public.vouchers(serial, real_code, amount, fuel_type, branch, status, updated_on)
        VALUES ('DEMO-' || batch || '-' || n, '', CASE WHEN fuel = 'בנזין' THEN 100 ELSE 50 END,
          fuel, pool, 'טרם שומש', to_char(now() AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD'));
      END LOOP;
    END LOOP;
  END LOOP;
  -- Each pool gets 1,000 NIS petrol + 500 NIS diesel as actual test inventory, never a fake saved budget.
  IF to_regclass('public.activity_log') IS NOT NULL THEN
    INSERT INTO public.activity_log(user_id, user_name, role, action, target)
    SELECT auth.uid(), full_name, 'אדמין מרכזי', 'טעינת נתוני הדגמה', n::text || ' שוברים לבדיקה בלבד'
    FROM public.profiles WHERE id = auth.uid();
  END IF;
  RETURN jsonb_build_object('vouchers_created', n);
END $$;
REVOKE ALL ON FUNCTION public.generate_demo_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_demo_data() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- VERIFY installation in SQL Editor (read only):
-- SELECT o.user_id, p.full_name, public.has_role(o.user_id, 'admin'::public.app_role) AS is_admin
-- FROM public.development_tools_owner o JOIN public.profiles p ON p.id = o.user_id;
-- Never put a caller-supplied UUID in the binding or derive authority from editable names at runtime.
-- Test via app as Maya, another admin and a supervisor. Only Maya's access RPC returns true.
-- The SQL Editor has no auth.uid() and cannot invoke maintenance by accident.
-- To deliberately test AS MAYA in the trusted SQL Editor, obtain the verified bound UUID above,
-- BEGIN; SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claim.sub', '<VERIFIED_MAYA_UUID>', true);
-- SELECT public.can_use_development_tools();
-- SELECT public.reset_development_data('איפוס וניקוי נתונים');
-- SELECT count(*) FROM public.vouchers;
-- ROLLBACK; -- Inspection test only. Replace with COMMIT ONLY when you intend permanent deletion.