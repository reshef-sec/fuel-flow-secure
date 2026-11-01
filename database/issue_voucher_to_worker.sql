-- issue_voucher_to_worker v2: JSONB result, atomic issuance, safe staff fields only.
-- Prerequisite: install the prior production/issuance schema.
-- DROP is required because CREATE OR REPLACE cannot change a return type.
BEGIN;
-- Run once in the Supabase SQL Editor. Safe to re-run.

-- 1) Canonical helpers (same rules as the app).
CREATE OR REPLACE FUNCTION public.canonical_fuel(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN coalesce(p, '') ~* '(סולר|דיזל|diesel|solar)' THEN 'סולר' ELSE 'בנזין' END
$$;

CREATE OR REPLACE FUNCTION public.canonical_branch(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN x = '' OR x IN ('מאגר ראשי', 'מאגר מרכזי') THEN 'מאגר מרכזי' ELSE x END
  FROM (SELECT btrim(regexp_replace(regexp_replace(btrim(coalesce(p, '')), '^סניף\s+', ''), '(\s*\([^)]*\))+\s*$', '')) AS x) t
$$;

CREATE OR REPLACE FUNCTION public.card_holder(p_supervisor text, p_branch text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(nullif(btrim(regexp_replace(coalesce(p_supervisor, ''), '\s+', ' ', 'g')), ''),
    nullif(btrim(regexp_replace(substring(coalesce(p_branch, '') FROM '\(([^()]*)\)'), '^מפקח\s+', '')), ''))
$$;

CREATE INDEX IF NOT EXISTS vouchers_issuance_lookup_idx
  ON public.vouchers (fuel_type, amount) WHERE status IN ('טרם שומש', 'available') AND link_id IS NULL;

-- Returns {link_id, total, vouchers:[{serial, amount, fuel_type, item_index, ...}]}.
-- Never serialize the complete vouchers row: it may contain confidential codes.
DROP FUNCTION IF EXISTS public.issue_voucher_to_worker(jsonb, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.issue_voucher_to_worker(
  p_items jsonb, p_branch text, p_supervisor text, p_link jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  is_admin boolean; is_branch boolean; is_sup boolean;
  caller_branch text; caller_name text;
  v_link text := p_link->>'id';
  v_name text := btrim(coalesce(p_link->>'employee_name', ''));
  stamp timestamptz := clock_timestamp();
  item jsonb; idx integer := 0;
  want integer; fuel text; got integer; d jsonb;
  result jsonb := '[]'::jsonb; item_rows jsonb; total_amount bigint := 0;
  card record; picked text[]; all_ids text[] := ARRAY[]::text[];
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'נדרשת התחברות'; END IF;
  is_admin := public.has_role(caller, 'admin');
  is_branch := public.has_role(caller, 'branch');
  is_sup := public.has_role(caller, 'supervisor');
  IF NOT (is_admin OR is_branch OR is_sup) THEN RAISE EXCEPTION 'אין הרשאה'; END IF;
  SELECT p.branch, btrim(concat_ws(' ', u.last_name, u.first_name)) INTO caller_branch, caller_name
    FROM public.profiles p LEFT JOIN public.app_users u ON u.national_id = p.national_id WHERE p.id = caller;
  IF NOT is_admin AND public.canonical_branch(p_branch) <> public.canonical_branch(caller_branch) THEN
    RAISE EXCEPTION 'אין הרשאה לסניף זה'; END IF;
  IF v_link IS NULL OR v_link !~ '^\d{4,12}$' OR length(v_name) < 2 THEN RAISE EXCEPTION 'פרטי לינק לא תקינים'; END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'יש לבחור שוברים'; END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    want := (item->>'amount')::integer;
    fuel := public.canonical_fuel(item->>'fuel_type');
    IF want IS NULL OR (fuel = 'בנזין' AND (want < 100 OR want % 100 <> 0)) OR (fuel = 'סולר' AND (want < 50 OR want % 50 <> 0)) THEN
      RAISE EXCEPTION 'בנזין בכפולות של 100 ₪ וסולר בכפולות של 50 ₪'; END IF;
    got := 0; picked := ARRAY[]::text[];
    -- Largest denominations first; exact value match per card; rows locked, concurrent issuers skip them.
    FOR card IN
      SELECT v.serial, v.amount FROM public.vouchers v
      WHERE v.status IN ('טרם שומש', 'available')
        AND nullif(v.link_id, '') IS NULL AND nullif(v.worker_id, '') IS NULL AND nullif(v.worker_name, '') IS NULL
        AND public.canonical_fuel(v.fuel_type) = fuel
        AND v.amount > 0 AND v.amount <= want
        AND NOT (v.serial = ANY(all_ids))
        AND CASE
          WHEN is_admin THEN public.canonical_branch(v.branch) = 'מאגר מרכזי' AND public.card_holder(v.supervisor, v.branch) IS NULL
          WHEN is_branch THEN public.canonical_branch(v.branch) = public.canonical_branch(caller_branch)
            AND public.canonical_branch(v.branch) <> 'מאגר מרכזי' AND public.card_holder(v.supervisor, v.branch) IS NULL
          ELSE public.canonical_branch(v.branch) = public.canonical_branch(caller_branch)
            AND (v.supervisor_id = caller OR public.card_holder(v.supervisor, v.branch) = caller_name)
        END
      ORDER BY v.amount DESC, v.serial
      FOR UPDATE SKIP LOCKED
    LOOP
      EXIT WHEN got = want;
      IF got + card.amount <= want THEN got := got + card.amount; picked := picked || card.serial; END IF;
    END LOOP;
    IF got <> want THEN RAISE EXCEPTION 'אין מספיק מלאי זמין במאגר עבור סוג דלק וסכום זה'; END IF;

    d := coalesce(item->'details', '{}'::jsonb);
    UPDATE public.vouchers v SET
      branch = p_branch, supervisor = p_supervisor, supervisor_id = caller,
      status = 'issued', fuel_type = fuel,
      client = d->>'client', client_id = d->>'client_id', client_code = d->>'client_code',
      account_name = d->>'account_name', standard = d->>'standard', site_id = d->>'site_id', site_name = d->>'site_name',
      reason = d->>'reason', issue_reason = d->>'reason', route = d->>'route',
      requester = coalesce(d->>'requester', v.requester),
      worker_name = v_name, employee_name = v_name, link_id = v_link,
      updated_on = to_char(stamp AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD'),
      delivered_at = to_char(stamp AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD'),
      issued_at = stamp, expires_at = stamp + interval '3 months'
    WHERE v.serial = ANY(picked);
    all_ids := all_ids || picked;
    -- Convert a safe projection to JSONB; SQL column types no longer need a rigid RETURNS TABLE match.
    SELECT coalesce(jsonb_agg(to_jsonb(safe_row) ORDER BY safe_row.serial), '[]'::jsonb)
      INTO item_rows
      FROM (SELECT v.serial, v.card_number, v.amount, v.fuel_type, idx AS item_index,
        v.link_id, v.status, v.issued_at, v.expires_at
        FROM public.vouchers v WHERE v.serial = ANY(picked)) safe_row;
    result := result || item_rows;
    total_amount := total_amount + want;
    idx := idx + 1;
  END LOOP;

  INSERT INTO public.worker_links(id, total, serials, created_on, employee_name, branch, supervisor_id)
  VALUES (v_link, (SELECT sum(v.amount) FROM public.vouchers v WHERE v.serial = ANY(all_ids)), all_ids,
    to_char(stamp AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD'), v_name, p_branch, caller);
  RETURN jsonb_build_object('link_id', v_link, 'total', total_amount, 'vouchers', result);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_voucher_to_worker(jsonb, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_voucher_to_worker(jsonb, text, text, jsonb) TO authenticated, anon;
-- anon has EXECUTE only; the auth.uid()/protected-role checks above reject unauthenticated callers.
NOTIFY pgrst, 'reload schema';

COMMIT;
