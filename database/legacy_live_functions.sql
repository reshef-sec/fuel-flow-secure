-- function _link_codes
CREATE OR REPLACE FUNCTION public._link_codes(p_serials text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'serial', v.serial,
    'real_code', coalesce(c.real_code, v.real_code),
    'amount', v.amount,
    'fuel_type', coalesce(v.fuel_type, 'בנזין')) order by v.serial), '[]'::jsonb)
  from vouchers v left join voucher_codes c on c.serial = v.serial
  where v.serial = any(p_serials) and v.status <> 'חסום'
$function$


-- function _link_expired
CREATE OR REPLACE FUNCTION public._link_expired(l worker_links)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(l.created_at, l.created_on::timestamptz) + interval '3 months' < now()
$function$


-- function can_use_development_tools
CREATE OR REPLACE FUNCTION public.can_use_development_tools()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.development_tools_owner WHERE singleton AND user_id = auth.uid())
    AND public.has_role(auth.uid(), 'admin'::public.app_role);
$function$


-- function canonical_branch
CREATE OR REPLACE FUNCTION public.canonical_branch(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE WHEN x = '' OR x IN ('מאגר ראשי', 'מאגר מרכזי') THEN 'מאגר מרכזי' ELSE x END
  FROM (SELECT btrim(regexp_replace(regexp_replace(btrim(coalesce(p, '')), '^סניף\s+', ''), '(\s*\([^)]*\))+\s*$', '')) AS x) t
$function$


-- function canonical_fuel
CREATE OR REPLACE FUNCTION public.canonical_fuel(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE WHEN coalesce(p, '') ~* '(סולר|דיזל|diesel|solar)' THEN 'סולר' ELSE 'בנזין' END
$function$


-- function card_holder
CREATE OR REPLACE FUNCTION public.card_holder(p_supervisor text, p_branch text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT coalesce(nullif(btrim(regexp_replace(coalesce(p_supervisor, ''), '\s+', ' ', 'g')), ''),
    nullif(btrim(regexp_replace(substring(coalesce(p_branch, '') FROM '\(([^()]*)\)'), '^מפקח\s+', '')), ''))
$function$


-- function central_inventory_counts
CREATE OR REPLACE FUNCTION public.central_inventory_counts()
 RETURNS TABLE(fuel_type text, amount integer, cards bigint, total bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT v.fuel_type, v.amount, count(*), sum(v.amount)
  FROM public.vouchers v
  WHERE public.has_role(auth.uid(), 'admin')
    AND v.branch = 'מאגר ראשי' AND v.supervisor IS NULL AND v.status = 'טרם שומש'
  GROUP BY v.fuel_type, v.amount
  ORDER BY v.fuel_type, v.amount;
$function$


-- function central_stock_available
CREATE OR REPLACE FUNCTION public.central_stock_available(_fuel text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(sum(amount), 0)::integer FROM public.vouchers
  WHERE public.has_role(auth.uid(), 'admin')
    AND branch = 'מאגר ראשי' AND supervisor IS NULL AND status = 'טרם שומש' AND fuel_type = _fuel;
$function$


-- function generate_demo_data
CREATE OR REPLACE FUNCTION public.generate_demo_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
END $function$


-- function get_central_inventory_snapshot
CREATE OR REPLACE FUNCTION public.get_central_inventory_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501';
  END IF;
  WITH stock AS (SELECT to_jsonb(v) AS r FROM public.vouchers v), central AS (
    SELECT coalesce(nullif(r->>'value','')::numeric,nullif(r->>'amount','')::numeric,0) AS amount,
      CASE WHEN lower(btrim(coalesce(r->>'fuel_type',''))) IN ('סולר','דיזל','diesel','solar') THEN 'סולר' ELSE 'בנזין' END AS fuel
    FROM stock WHERE r->>'status' IN ('available','טרם שומש')
      AND ((r ? 'branch_id' AND r->>'branch_id' IS NULL)
        OR btrim(coalesce(r->>'branch','')) IN ('מאגר מרכזי','מאגר ראשי'))
      AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY['supervisor','supervisor_id','link_id','worker_id','worker_name','employee_id','employee_name']) k WHERE nullif(btrim(r->>k),'') IS NOT NULL)
  ), grouped AS (
    SELECT amount,fuel,count(*) AS count FROM central GROUP BY amount,fuel
  ) SELECT jsonb_build_object(
    'total_available_amount',coalesce((SELECT sum(amount) FROM central),0),
    'gasoline_amount',coalesce((SELECT sum(amount) FROM central WHERE fuel='בנזין'),0),
    'diesel_amount',coalesce((SELECT sum(amount) FROM central WHERE fuel='סולר'),0),
    'denominations',coalesce((SELECT jsonb_agg(jsonb_build_object('amount',amount,'fuel_type',fuel,'count',count) ORDER BY amount,fuel) FROM grouped),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $function$


-- function get_central_inventory_summary
CREATE OR REPLACE FUNCTION public.get_central_inventory_summary()
 RETURNS TABLE(total_available_amount numeric, gasoline_amount numeric, diesel_amount numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT (r->>'total_available_amount')::numeric,(r->>'gasoline_amount')::numeric,(r->>'diesel_amount')::numeric
  FROM (SELECT public.get_central_inventory_snapshot() r) snapshot;
$function$


-- function has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $function$


-- function import_voucher_inventory
CREATE OR REPLACE FUNCTION public.import_voucher_inventory(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE r record; inserted integer; added integer:=0; skipped integer:=0; ids text[]:=ARRAY[]::text[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)=0 OR jsonb_array_length(p_rows)>5000 THEN RAISE EXCEPTION 'Invalid stock file'; END IF;
  LOCK TABLE public.vouchers, public.voucher_codes IN SHARE ROW EXCLUSIVE MODE;
  FOR r IN SELECT * FROM jsonb_to_recordset(p_rows) x(serial text,real_code text,amount integer,fuel_type text) LOOP
    IF nullif(trim(r.serial),'') IS NULL THEN RAISE EXCEPTION 'Card number required'; END IF;
    r.serial:=trim(r.serial);
    IF EXISTS(SELECT 1 FROM public.vouchers WHERE card_number=r.serial) OR EXISTS(SELECT 1 FROM public.voucher_codes WHERE card_number=r.serial) THEN skipped:=skipped+1; CONTINUE; END IF;
    IF nullif(trim(r.real_code),'') IS NULL OR r.amount IS NULL OR r.amount<=0 OR r.amount%50<>0 OR r.fuel_type IS NULL OR r.fuel_type NOT IN ('בנזין','סולר') THEN RAISE EXCEPTION 'Invalid stock row'; END IF;
    INSERT INTO public.vouchers(serial,real_code,amount,fuel_type,branch,status,updated_on)
      VALUES(r.serial,'',r.amount,r.fuel_type,'מאגר ראשי','טרם שומש',to_char(now() AT TIME ZONE 'Asia/Jerusalem','YYYY-MM-DD')) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS inserted=ROW_COUNT;
    IF inserted=0 THEN skipped:=skipped+1; CONTINUE; END IF;
    INSERT INTO public.voucher_codes(serial,real_code) VALUES(r.serial,trim(r.real_code));
    added:=added+1; ids:=array_append(ids,r.serial);
  END LOOP;
  PERFORM public.log_import_action('ייבוא מלאי שוברים',added || ' נוספו, ' || skipped || ' כפולים דולגו');
  RETURN jsonb_build_object('added',added,'skipped',skipped,'serials',ids);
END $function$


-- function issue_voucher_to_worker
CREATE OR REPLACE FUNCTION public.issue_voucher_to_worker(p_items jsonb, p_branch text, p_supervisor text, p_link jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$


-- function lock_development_transactions
CREATE OR REPLACE FUNCTION public.lock_development_transactions()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
END $function$


-- function log_import_action
CREATE OR REPLACE FUNCTION public.log_import_action(p_action text, p_target text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.activity_log(user_id,user_name,role,action,target)
    VALUES(auth.uid(),coalesce((SELECT full_name FROM public.profiles WHERE id=auth.uid()),''),'אדמין מרכזי',p_action,p_target);
END $function$


-- function lookup_auth_id
CREATE OR REPLACE FUNCTION public.lookup_auth_id(p_national_id text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from profiles where auth.uid() is not null and national_id = p_national_id limit 1
$function$


-- function my_branch
CREATE OR REPLACE FUNCTION public.my_branch()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT branch FROM public.profiles WHERE id = auth.uid() $function$


-- function needs_setup
CREATE OR REPLACE FUNCTION public.needs_setup()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not exists (select 1 from user_roles where role = 'admin')
$function$


-- function open_worker_wallet
CREATE OR REPLACE FUNCTION public.open_worker_wallet(p_id text, p_worker_id text, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare l worker_links; n int;
begin
  select * into l from worker_links where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'state', 'invalid'); end if;
  if _link_expired(l) then return jsonb_build_object('ok', false, 'state', 'expired'); end if;
  if l.locked or coalesce(l.failed_attempts, 0) >= 3 then return jsonb_build_object('ok', false, 'state', 'locked'); end if;
  if l.worker_id is distinct from p_worker_id or l.phone is distinct from p_phone then
    n := coalesce(l.failed_attempts, 0) + 1;
    update worker_links set failed_attempts = n, locked = n >= 3,
      locked_at = case when n >= 3 then now() else locked_at end where id = p_id;
    return jsonb_build_object('ok', false, 'state', case when n >= 3 then 'locked' else 'mismatch' end,
      'attempts_left', greatest(0, 3 - n));
  end if;
  update worker_links set failed_attempts = 0 where id = p_id and coalesce(failed_attempts, 0) > 0;
  return jsonb_build_object('ok', true, 'state', 'ok', 'attempts_left', 3, 'codes', _link_codes(l.serials));
end $function$


-- function paz_card_match_key
CREATE OR REPLACE FUNCTION public.paz_card_match_key(p_card text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
  WITH cleaned AS (
    SELECT regexp_replace(translate(p_card, chr(160) || chr(65279), ''), '[[:space:]]', '', 'g') AS value
  ), numeric_text AS (
    SELECT CASE WHEN value ~ '^[0-9]+[.]0+$' THEN split_part(value, '.', 1) ELSE value END AS value FROM cleaned
  )
  SELECT CASE WHEN value ~ '^[0-9]+$' THEN coalesce(nullif(ltrim(value, '0'), ''), '0') ELSE value END FROM numeric_text
$function$


-- function reconcile_redeemed_vouchers
CREATE OR REPLACE FUNCTION public.reconcile_redeemed_vouchers(card_numbers text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE keys text[]; changed_cards text[]; n integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501';
  END IF;
  SELECT array_agg(DISTINCT public.paz_card_match_key(x)) INTO keys
    FROM unnest(card_numbers) AS input(x) WHERE nullif(public.paz_card_match_key(x), '') IS NOT NULL;
  IF coalesce(cardinality(keys), 0)=0 THEN RAISE EXCEPTION 'Card numbers required'; END IF;

  -- Protect against a concurrent import/issue changing the matching set. Any
  -- ambiguous normalized identity aborts everything, rather than redeeming
  -- two different physical cards (e.g. both 019950 and 19950 in inventory).
  LOCK TABLE public.vouchers IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (
    SELECT 1 FROM public.vouchers v WHERE public.paz_card_match_key(v.card_number)=ANY(keys)
    GROUP BY public.paz_card_match_key(v.card_number) HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'נמצאו מספרי כרטיסים דו־משמעיים לאחר הסרת אפסים מובילים; יש לבדוק את המלאי לפני הייבוא';
  END IF;

  WITH changed AS (
    UPDATE public.vouchers v
      SET status='redeemed', redeemed_at=coalesce(v.redeemed_at, now()),
          updated_on=to_char(now() AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD')
      WHERE public.paz_card_match_key(v.card_number)=ANY(keys)
        AND (v.status IN ('available', 'issued', 'טרם שומש', 'הוקצה לעובד', 'מומש בפועל', 'מומש סופית')
          OR (v.status='redeemed' AND v.redeemed_at IS NULL))
      RETURNING v.card_number
  ) SELECT count(*)::integer, array_agg(card_number ORDER BY card_number) INTO n, changed_cards FROM changed;

  -- Same transaction as redemption: an audit failure rolls the update back.
  INSERT INTO public.activity_log(user_id, user_name, role, action, target)
    VALUES(auth.uid(), coalesce((SELECT full_name FROM public.profiles WHERE id=auth.uid()), ''),
      'אדמין מרכזי', 'היזון חוזר מימושים מפז',
      n || ' שוברים עודכנו למומש סופית · מספרי כרטיסים: ' || coalesce(array_to_string(changed_cards, ', '), 'ללא'));
  RETURN n;
END $function$


-- function require_active_issuance_client
CREATE OR REPLACE FUNCTION public.require_active_issuance_client()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ BEGIN
  IF nullif(NEW.link_id,'') IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN IF OLD.link_id IS NOT DISTINCT FROM NEW.link_id THEN RETURN NEW; END IF; END IF;
  IF NEW.route='regular' THEN
    PERFORM 1 FROM public.regular_clients WHERE client_id=NEW.client_id AND site_id=NEW.site_id AND is_active FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'הלקוח או האתר אינם פעילים'; END IF;
  ELSIF NEW.route='b2b' THEN
    PERFORM 1 FROM public.b2b_clients WHERE btrim(client_code)=btrim(NEW.client_code) AND btrim(standard)=btrim(NEW.standard) AND is_active FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'רכב העבודה אינו פעיל'; END IF;
  ELSE RAISE EXCEPTION 'יש לבחור מאגר לקוחות להנפקה'; END IF;
  RETURN NEW;
END $function$


-- function require_active_private_vehicle
CREATE OR REPLACE FUNCTION public.require_active_private_vehicle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ BEGIN
  IF NEW.route IS DISTINCT FROM 'regular' OR nullif(NEW.link_id,'') IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN IF OLD.link_id IS NOT DISTINCT FROM NEW.link_id THEN RETURN NEW; END IF; END IF;
  PERFORM 1 FROM public.regular_clients WHERE btrim(client_id)=btrim(NEW.client_id) AND btrim(site_id)=btrim(NEW.site_id) AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'הרכב הפרטי או האתר אינם פעילים'; END IF;
  RETURN NEW;
END $function$


-- function reset_demo_data
CREATE OR REPLACE FUNCTION public.reset_demo_data()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ BEGIN RAISE EXCEPTION 'Use reset_development_data with explicit confirmation'; END $function$


-- function reset_development_data
CREATE OR REPLACE FUNCTION public.reset_development_data(p_confirmation text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
END $function$


-- function set_voucher_expiry
CREATE OR REPLACE FUNCTION public.set_voucher_expiry()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'הוקצה לעובד' AND NEW.issued_at IS NULL THEN
    NEW.issued_at  := now();
    NEW.expires_at := now() + interval '3 months';
  END IF;
  IF NEW.status <> 'מומש סופית' AND NEW.expires_at IS NOT NULL AND NEW.expires_at < now() THEN
    NEW.status := 'חסום';
  END IF;
  RETURN NEW;
END $function$


-- function sign_worker_link
CREATE OR REPLACE FUNCTION public.sign_worker_link(p_id text, p_worker_id text, p_phone text, p_full_name text, p_signature text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare l worker_links;
begin
  if p_worker_id !~ '^\d{9}$' or p_phone !~ '^0\d{8,9}$' or length(trim(p_full_name)) < 2
     or p_signature not like 'data:image/png;base64,%' or length(p_signature) > 800000 then
    return jsonb_build_object('ok', false);
  end if;
  select * into l from worker_links where id = p_id for update;
  if not found or l.worker_id is not null or _link_expired(l) or l.locked or coalesce(l.failed_attempts, 0) >= 3 then
    return jsonb_build_object('ok', false);
  end if;
  update worker_links set worker_id = p_worker_id, phone = p_phone, signed_at = to_char(now(), 'YYYY-MM-DD') where id = p_id;
  update vouchers set worker_id = p_worker_id, worker_name = trim(p_full_name),
    employee_id = p_worker_id, employee_phone = p_phone, employee_name = trim(p_full_name)
  where serial = any(l.serials);
  insert into signatures_archive (link_id, branch, supervisor_id, employee_name, employee_id_number,
    employee_phone, total_amount, voucher_record_ids, signature_image_url)
  values (p_id, to_jsonb(l)->>'branch', (to_jsonb(l)->>'supervisor_id')::uuid, trim(p_full_name), p_worker_id,
    p_phone, coalesce((select sum(amount) from vouchers where serial = any(l.serials)), l.total), l.serials, p_signature);
  return jsonb_build_object('ok', true, 'codes', _link_codes(l.serials));
end $function$


-- function store_voucher_codes
CREATE OR REPLACE FUNCTION public.store_voucher_codes(p_codes jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_codes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Expected array of voucher codes';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_codes) AS x(serial text, real_code text)
    WHERE coalesce(trim(serial), '') = '' OR coalesce(trim(real_code), '') = '') THEN
    RAISE EXCEPTION 'Card number and code are required';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_codes) AS x(serial text, real_code text)
    WHERE NOT EXISTS (SELECT 1 FROM public.vouchers v WHERE v.serial = x.serial)) THEN
    RAISE EXCEPTION 'Voucher does not exist';
  END IF;
  INSERT INTO public.voucher_codes(serial, real_code)
    SELECT serial, real_code FROM jsonb_to_recordset(p_codes) AS x(serial text, real_code text)
    ON CONFLICT (serial) DO UPDATE SET real_code = EXCLUDED.real_code;
  -- Keep the optional legacy alias in sync, without requiring it to exist.
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name = 'voucher_codes' AND column_name = 'redemption_code') THEN
    EXECUTE 'UPDATE public.voucher_codes c SET redemption_code = c.real_code
      WHERE c.serial IN (SELECT x.serial FROM jsonb_to_recordset($1) AS x(serial text, real_code text))'
      USING p_codes;
  END IF;
END $function$


-- function sync_private_vehicles
CREATE OR REPLACE FUNCTION public.sync_private_vehicles(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE cleaned jsonb; added integer; updated integer; deactivated integer; duplicates integer; blanks integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid private vehicle file'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object') THEN RAISE EXCEPTION 'Invalid private vehicle row'; END IF;
  SELECT count(*) INTO blanks FROM jsonb_array_elements(p_rows) x
    WHERE NOT EXISTS(SELECT 1 FROM jsonb_each_text(x) f WHERE nullif(btrim(f.value),'') IS NOT NULL);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) x
    WHERE EXISTS(SELECT 1 FROM jsonb_each_text(x) f WHERE nullif(btrim(f.value),'') IS NOT NULL)
      AND (nullif(btrim(x->>'client_id'),'') IS NULL OR nullif(btrim(x->>'site_id'),'') IS NULL)) THEN
    RAISE EXCEPTION 'יש למלא מספר לקוח ומספר אתר בכל שורה שאינה ריקה';
  END IF;
  WITH incoming AS (
    SELECT value || jsonb_build_object('client_id',btrim(value->>'client_id'),'site_id',btrim(value->>'site_id')) AS row,ord
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY x(value,ord)
    WHERE nullif(btrim(value->>'client_id'),'') IS NOT NULL AND nullif(btrim(value->>'site_id'),'') IS NOT NULL
  ), first_rows AS (
    SELECT DISTINCT ON(row->>'client_id',row->>'site_id') row,ord FROM incoming ORDER BY row->>'client_id',row->>'site_id',ord
  ) SELECT jsonb_agg(row ORDER BY ord) INTO cleaned FROM first_rows;
  IF coalesce(jsonb_array_length(cleaned),0)=0 THEN RAISE EXCEPTION 'לא נמצאו רכבים פרטיים תקינים; המאגר לא שונה'; END IF;
  duplicates:=jsonb_array_length(p_rows)-blanks-jsonb_array_length(cleaned);
  LOCK TABLE public.regular_clients IN SHARE ROW EXCLUSIVE MODE;
  SELECT count(*) INTO updated FROM jsonb_to_recordset(cleaned) x(client_id text,site_id text)
    JOIN public.regular_clients c ON btrim(c.client_id)=x.client_id AND btrim(c.site_id)=x.site_id;
  added:=jsonb_array_length(cleaned)-updated;
  UPDATE public.regular_clients c SET is_active=false WHERE c.is_active AND NOT EXISTS(
    SELECT 1 FROM jsonb_to_recordset(cleaned) x(client_id text,site_id text) WHERE btrim(c.client_id)=x.client_id AND btrim(c.site_id)=x.site_id);
  GET DIAGNOSTICS deactivated=ROW_COUNT;
  UPDATE public.regular_clients c SET client_id=x.client_id,site_id=x.site_id,client_name=coalesce(x.client_name,''),site_name=coalesce(x.site_name,''),standard=x.standard,is_active=true
    FROM jsonb_to_recordset(cleaned) x(client_id text,site_id text,client_name text,site_name text,standard text)
    WHERE btrim(c.client_id)=x.client_id AND btrim(c.site_id)=x.site_id;
  INSERT INTO public.regular_clients(client_id,site_id,client_name,site_name,standard,is_active)
    SELECT x.client_id,x.site_id,coalesce(x.client_name,''),coalesce(x.site_name,''),x.standard,true
    FROM jsonb_to_recordset(cleaned) x(client_id text,site_id text,client_name text,site_name text,standard text)
    WHERE NOT EXISTS(SELECT 1 FROM public.regular_clients c WHERE btrim(c.client_id)=x.client_id AND btrim(c.site_id)=x.site_id);
  PERFORM public.log_import_action('סנכרון מאגר רכב פרטי',added || ' חדשים, ' || updated || ' עודכנו, ' || deactivated || ' לא פעילים, ' || duplicates || ' כפולים דולגו');
  RETURN jsonb_build_object('added',added,'updated',updated,'deactivated',deactivated,'duplicates',duplicates,'blanks',blanks);
END $function$


-- function sync_redemption_code
CREATE OR REPLACE FUNCTION public.sync_redemption_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.redemption_code IS NULL OR NEW.redemption_code = '' THEN NEW.redemption_code := NEW.real_code; END IF;
  RETURN NEW;
END $function$


-- function sync_vehicle_pool
CREATE OR REPLACE FUNCTION public.sync_vehicle_pool(p_pool text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE added integer; updated integer; deactivated integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)=0 THEN RAISE EXCEPTION 'Empty or invalid vehicle file'; END IF;
  IF p_pool='regular' THEN
    LOCK TABLE public.regular_clients IN SHARE ROW EXCLUSIVE MODE;
    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_rows) x(client_id text,site_id text) WHERE nullif(trim(client_id),'') IS NULL OR nullif(trim(site_id),'') IS NULL)
      OR EXISTS (SELECT 1 FROM jsonb_to_recordset(p_rows) x(client_id text,site_id text) GROUP BY client_id,site_id HAVING count(*)>1) THEN RAISE EXCEPTION 'Missing or duplicate client/site key'; END IF;
    SELECT count(*) INTO added FROM jsonb_to_recordset(p_rows) x(client_id text,site_id text) WHERE NOT EXISTS (SELECT 1 FROM public.regular_clients c WHERE c.client_id=x.client_id AND c.site_id=x.site_id);
    updated := jsonb_array_length(p_rows)-added;
    UPDATE public.regular_clients c SET is_active=false WHERE is_active AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows) x(client_id text,site_id text) WHERE c.client_id=x.client_id AND c.site_id=x.site_id);
    GET DIAGNOSTICS deactivated=ROW_COUNT;
    INSERT INTO public.regular_clients(client_id,client_name,site_id,site_name,standard,is_active)
      SELECT client_id,coalesce(client_name,''),site_id,coalesce(site_name,''),standard,true FROM jsonb_to_recordset(p_rows) x(client_id text,client_name text,site_id text,site_name text,standard text)
      ON CONFLICT(client_id,site_id) DO UPDATE SET client_name=excluded.client_name,site_name=excluded.site_name,standard=excluded.standard,is_active=true;
  ELSIF p_pool='b2b' THEN
    LOCK TABLE public.b2b_clients IN SHARE ROW EXCLUSIVE MODE;
    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_rows) x(client_code text,account_name text) WHERE nullif(trim(client_code),'') IS NULL OR nullif(trim(account_name),'') IS NULL)
      OR EXISTS (SELECT 1 FROM jsonb_to_recordset(p_rows) x(client_code text,account_name text) GROUP BY client_code,account_name HAVING count(*)>1) THEN RAISE EXCEPTION 'Missing or duplicate client/account key'; END IF;
    SELECT count(*) INTO added FROM jsonb_to_recordset(p_rows) x(client_code text,account_name text) WHERE NOT EXISTS(SELECT 1 FROM public.b2b_clients c WHERE c.client_code=x.client_code AND c.account_name=x.account_name);
    updated:=jsonb_array_length(p_rows)-added;
    UPDATE public.b2b_clients c SET is_active=false WHERE is_active AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows) x(client_code text,account_name text) WHERE c.client_code=x.client_code AND c.account_name=x.account_name);
    GET DIAGNOSTICS deactivated=ROW_COUNT;
    INSERT INTO public.b2b_clients(client_code,account_name,client_name,branch,standard,balance,load_type,budget_section,account_key,item_family,account_status,account_type,is_active)
      SELECT client_code,account_name,coalesce(client_name,''),coalesce(branch,''),coalesce(standard,''),balance,load_type,budget_section,account_key,item_family,account_status,account_type,true
      FROM jsonb_to_recordset(p_rows) x(client_code text,account_name text,client_name text,branch text,standard text,balance text,load_type text,budget_section text,account_key text,item_family text,account_status text,account_type text)
      ON CONFLICT(client_code,account_name) DO UPDATE SET client_name=excluded.client_name,branch=excluded.branch,standard=excluded.standard,balance=excluded.balance,load_type=excluded.load_type,budget_section=excluded.budget_section,account_key=excluded.account_key,item_family=excluded.item_family,account_status=excluded.account_status,account_type=excluded.account_type,is_active=true;
  ELSE RAISE EXCEPTION 'Unknown vehicle pool'; END IF;
  PERFORM public.log_import_action('סנכרון מאגר רכב',p_pool || ': ' || added || ' חדשים, ' || updated || ' עודכנו, ' || deactivated || ' לא פעילים');
  RETURN jsonb_build_object('added',added,'updated',updated,'deactivated',deactivated);
END $function$


-- function sync_work_vehicles
CREATE OR REPLACE FUNCTION public.sync_work_vehicles(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE cleaned jsonb; added integer; updated integer; deactivated integer; duplicates integer; blanks integer; invalid integer; reactivated integer; remained_active integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid work vehicle file'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object') THEN RAISE EXCEPTION 'Invalid work vehicle row'; END IF;
  SELECT count(*) INTO blanks FROM jsonb_array_elements(p_rows) x
    WHERE NOT EXISTS(SELECT 1 FROM jsonb_each_text(x) f WHERE nullif(btrim(f.value),'') IS NOT NULL);
  -- Skip incomplete identities as well as blanks; only valid keys form the snapshot.
  SELECT count(*) INTO invalid FROM jsonb_array_elements(p_rows) x
    WHERE EXISTS(SELECT 1 FROM jsonb_each_text(x) f WHERE nullif(btrim(f.value),'') IS NOT NULL)
      AND (nullif(btrim(x->>'standard'),'') IS NULL OR nullif(btrim(x->>'client_code'),'') IS NULL);
  WITH incoming AS (
    SELECT value || jsonb_build_object('standard',btrim(value->>'standard'),'client_code',btrim(value->>'client_code')) AS row, ord
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY x(value,ord)
    WHERE nullif(btrim(value->>'standard'),'') IS NOT NULL AND nullif(btrim(value->>'client_code'),'') IS NOT NULL
  ), first_rows AS (
    SELECT DISTINCT ON (row->>'standard',row->>'client_code') row,ord FROM incoming ORDER BY row->>'standard',row->>'client_code',ord
  ) SELECT jsonb_agg(row ORDER BY ord) INTO cleaned FROM first_rows;
  IF coalesce(jsonb_array_length(cleaned),0)=0 THEN RAISE EXCEPTION 'לא נמצאו רכבי עבודה תקינים; המאגר לא שונה'; END IF;
  duplicates:=jsonb_array_length(p_rows)-blanks-invalid-jsonb_array_length(cleaned);
  LOCK TABLE public.b2b_clients IN SHARE ROW EXCLUSIVE MODE;
  SELECT count(*),count(*) FILTER (WHERE NOT c.is_active),count(*) FILTER (WHERE c.is_active)
    INTO updated,reactivated,remained_active FROM jsonb_to_recordset(cleaned) x(standard text,client_code text)
    JOIN public.b2b_clients c ON btrim(c.standard)=x.standard AND btrim(c.client_code)=x.client_code;
  added:=jsonb_array_length(cleaned)-updated;
  UPDATE public.b2b_clients c SET is_active=false WHERE c.is_active AND NOT EXISTS(
    SELECT 1 FROM jsonb_to_recordset(cleaned) x(standard text,client_code text) WHERE btrim(c.standard)=x.standard AND btrim(c.client_code)=x.client_code);
  GET DIAGNOSTICS deactivated=ROW_COUNT;
  UPDATE public.b2b_clients c SET standard=x.standard,client_code=x.client_code,account_name=coalesce(x.account_name,''),client_name=coalesce(x.client_name,''),branch=coalesce(x.branch,''),
    balance=x.balance,load_type=x.load_type,budget_section=x.budget_section,account_key=x.account_key,item_family=x.item_family,account_status=x.account_status,account_type=x.account_type,is_active=true
    FROM jsonb_to_recordset(cleaned) x(standard text,client_code text,account_name text,client_name text,branch text,balance text,load_type text,budget_section text,account_key text,item_family text,account_status text,account_type text)
    WHERE btrim(c.standard)=x.standard AND btrim(c.client_code)=x.client_code;
  INSERT INTO public.b2b_clients(standard,client_code,account_name,client_name,branch,balance,load_type,budget_section,account_key,item_family,account_status,account_type,is_active)
    SELECT x.standard,x.client_code,coalesce(x.account_name,''),coalesce(x.client_name,''),coalesce(x.branch,''),x.balance,x.load_type,x.budget_section,x.account_key,x.item_family,x.account_status,x.account_type,true
    FROM jsonb_to_recordset(cleaned) x(standard text,client_code text,account_name text,client_name text,branch text,balance text,load_type text,budget_section text,account_key text,item_family text,account_status text,account_type text)
    WHERE NOT EXISTS(SELECT 1 FROM public.b2b_clients c WHERE btrim(c.standard)=x.standard AND btrim(c.client_code)=x.client_code);
  PERFORM public.log_import_action('סנכרון מאגר רכב עבודה',reactivated || ' הוחזרו לפעיל, ' || remained_active || ' נותרו פעילים, ' || added || ' חדשים, ' || deactivated || ' לא פעילים, ' || (blanks+invalid) || ' שורות ריקות/לא תקינות דולגו, ' || duplicates || ' כפולים דולגו');
  RETURN jsonb_build_object('added',added,'updated',updated,'active',jsonb_array_length(cleaned),'reactivated',reactivated,'remained_active',remained_active,'deactivated',deactivated,'duplicates',duplicates,'blanks',blanks,'invalid',invalid,'skipped',blanks+invalid);
END $function$


-- function transfer_voucher_stock
CREATE OR REPLACE FUNCTION public.transfer_voucher_stock(p_items jsonb, p_branch text, p_supervisor text DEFAULT NULL::text, p_link jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller uuid := auth.uid();
  caller_branch text;
  caller_name text;
  admin_user boolean;
  branch_user boolean;
  supervisor_user boolean;
  target_id uuid;
  item jsonb;
  card public.vouchers;
  ids text[] := ARRAY[]::text[];
  item_ids text[];
  card_id text;
  requested integer;
  actual integer;
  fuel text;
  v_link_id text;
  stamp timestamptz := clock_timestamp();
  delta jsonb;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'נדרשת התחברות'; END IF;
  admin_user := public.has_role(caller, 'admin');
  branch_user := public.has_role(caller, 'branch');
  supervisor_user := public.has_role(caller, 'supervisor');
  IF NOT (admin_user OR branch_user OR supervisor_user) THEN RAISE EXCEPTION 'אין הרשאה'; END IF;
  SELECT p.branch, trim(concat_ws(' ', u.last_name, u.first_name))
    INTO caller_branch, caller_name
    FROM public.profiles p LEFT JOIN public.app_users u ON u.national_id = p.national_id
    WHERE p.id = caller;
  IF p_branch IS NULL OR length(trim(p_branch)) = 0 THEN RAISE EXCEPTION 'יש לבחור סניף'; END IF;
  IF NOT admin_user AND p_branch IS DISTINCT FROM caller_branch THEN RAISE EXCEPTION 'אין הרשאה לסניף זה'; END IF;
  IF p_link IS NULL AND supervisor_user AND NOT admin_user AND NOT branch_user THEN RAISE EXCEPTION 'אין הרשאה להקצאה'; END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'יש לבחור שוברים'; END IF;
  IF p_supervisor IS NOT NULL THEN
    SELECT p.id INTO target_id FROM public.profiles p JOIN public.app_users u ON u.national_id = p.national_id
      WHERE p.branch = p_branch AND public.has_role(p.id, 'supervisor')
        AND trim(concat_ws(' ', u.last_name, u.first_name)) = p_supervisor;
    IF target_id IS NULL THEN RAISE EXCEPTION 'המפקח אינו משויך לסניף'; END IF;
    IF p_link IS NOT NULL AND NOT admin_user AND NOT branch_user AND target_id <> caller THEN RAISE EXCEPTION 'אין הרשאה למפקח זה'; END IF;
  END IF;
  IF p_link IS NOT NULL THEN
    v_link_id := p_link->>'id';
    IF v_link_id IS NULL OR v_link_id !~ '^\d{4,12}$' OR length(trim(coalesce(p_link->>'employee_name', ''))) < 2 THEN RAISE EXCEPTION 'פרטי לינק לא תקינים'; END IF;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    requested := (item->>'amount')::integer;
    fuel := item->>'fuel_type';
    IF fuel NOT IN ('בנזין', 'סולר') OR fuel IS NULL OR requested IS NULL OR requested <= 0
      OR (fuel = 'בנזין' AND requested % 100 <> 0) OR (fuel = 'סולר' AND requested % 50 <> 0)
      THEN RAISE EXCEPTION 'בנזין בכפולות של 100 ₪ וסולר בכפולות של 50 ₪'; END IF;
    SELECT array_agg(value ORDER BY value) INTO item_ids FROM jsonb_array_elements_text(item->'serials');
    IF coalesce(cardinality(item_ids), 0) = 0 THEN RAISE EXCEPTION 'אין מספיק מלאי זמין במאגר עבור סוג דלק וסכום זה'; END IF;
    ids := ids || item_ids;
  END LOOP;
  IF cardinality(ids) <> (SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'כרטיס נבחר יותר מפעם אחת'; END IF;
  -- Lock all cards in the same order to prevent concurrent double allocation.
  PERFORM 1 FROM public.vouchers WHERE serial = ANY(ids) ORDER BY serial FOR UPDATE;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    SELECT array_agg(value) INTO item_ids FROM jsonb_array_elements_text(item->'serials');
    requested := (item->>'amount')::integer;
    fuel := item->>'fuel_type';
    actual := 0;
    FOREACH card_id IN ARRAY item_ids LOOP
      SELECT * INTO card FROM public.vouchers WHERE serial = card_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'אין מספיק מלאי זמין במאגר עבור סוג דלק וסכום זה'; END IF;
      IF card.status NOT IN ('טרם שומש', 'available') OR coalesce(card.fuel_type, 'בנזין') <> fuel
        OR nullif(card.link_id, '') IS NOT NULL OR nullif(card.worker_id, '') IS NOT NULL OR nullif(card.worker_name, '') IS NOT NULL
        THEN RAISE EXCEPTION 'אין מספיק מלאי זמין במאגר עבור סוג דלק וסכום זה'; END IF;
      IF admin_user THEN
        IF card.branch IS NOT NULL AND card.branch <> 'מאגר ראשי' OR nullif(card.supervisor, '') IS NOT NULL
          THEN RAISE EXCEPTION 'אין מספיק מלאי זמין במאגר עבור סוג דלק וסכום זה'; END IF;
      ELSE
        IF card.branch IS DISTINCT FROM caller_branch THEN RAISE EXCEPTION 'אין הרשאה למלאי זה'; END IF;
        IF branch_user AND nullif(card.supervisor, '') IS NOT NULL THEN RAISE EXCEPTION 'המלאי כבר הוקצה למפקח'; END IF;
        IF NOT branch_user AND (card.supervisor_id IS DISTINCT FROM caller
          AND NOT (card.supervisor_id IS NULL AND nullif(caller_name, '') IS NOT NULL AND card.supervisor = caller_name))
          THEN RAISE EXCEPTION 'אין הרשאה למלאי זה'; END IF;
      END IF;
      actual := actual + card.amount;
    END LOOP;
    IF actual <> requested THEN RAISE EXCEPTION 'אין מספיק מלאי זמין במאגר עבור סוג דלק וסכום זה'; END IF;
    delta := coalesce(item->'details', '{}'::jsonb);
    UPDATE public.vouchers SET branch = p_branch,
      supervisor = p_supervisor, supervisor_id = CASE WHEN p_link IS NOT NULL THEN caller ELSE target_id END,
      updated_on = to_char(stamp AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD'),
      status = CASE WHEN p_link IS NULL THEN status ELSE 'הוקצה לעובד' END,
      requester = coalesce(delta->>'requester', requester), approver = coalesce(delta->>'approver', approver),
      client = CASE WHEN p_link IS NULL THEN client ELSE delta->>'client' END,
      client_id = CASE WHEN p_link IS NULL THEN client_id ELSE delta->>'client_id' END,
      client_code = CASE WHEN p_link IS NULL THEN client_code ELSE delta->>'client_code' END,
      account_name = CASE WHEN p_link IS NULL THEN account_name ELSE delta->>'account_name' END,
      standard = CASE WHEN p_link IS NULL THEN standard ELSE delta->>'standard' END,
      site_id = CASE WHEN p_link IS NULL THEN site_id ELSE delta->>'site_id' END,
      site_name = CASE WHEN p_link IS NULL THEN site_name ELSE delta->>'site_name' END,
      reason = CASE WHEN p_link IS NULL THEN reason ELSE delta->>'reason' END,
      issue_reason = CASE WHEN p_link IS NULL THEN issue_reason ELSE delta->>'reason' END,
      route = CASE WHEN p_link IS NULL THEN route ELSE delta->>'route' END,
      worker_name = CASE WHEN p_link IS NULL THEN worker_name ELSE trim(p_link->>'employee_name') END,
      employee_name = CASE WHEN p_link IS NULL THEN employee_name ELSE trim(p_link->>'employee_name') END,
      link_id = CASE WHEN p_link IS NULL THEN vouchers.link_id ELSE v_link_id END,
      delivered_at = CASE WHEN p_link IS NULL THEN delivered_at ELSE to_char(stamp AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD') END,
      issued_at = CASE WHEN p_link IS NULL THEN issued_at ELSE stamp END,
      expires_at = CASE WHEN p_link IS NULL THEN expires_at ELSE stamp + interval '3 months' END
      WHERE serial = ANY(item_ids);
  END LOOP;
  IF p_link IS NOT NULL THEN
    INSERT INTO public.worker_links(id, total, serials, created_on, employee_name, branch, supervisor_id)
      VALUES(v_link_id, (SELECT sum(amount) FROM public.vouchers WHERE serial = ANY(ids)), ids,
        to_char(stamp AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD'), trim(p_link->>'employee_name'), p_branch, caller);
  END IF;
END;
$function$


-- function unlock_voucher_link
CREATE OR REPLACE FUNCTION public.unlock_voucher_link(p_link_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_owner uuid; v_serials text[];
BEGIN
  SELECT supervisor_id, serials INTO v_owner, v_serials FROM public.worker_links WHERE id = p_link_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'הלינק לא נמצא'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR v_owner = auth.uid()) THEN
    RAISE EXCEPTION 'רק מי שהפיק את השובר או אדמין יכולים לשחרר את הלינק';
  END IF;
  UPDATE public.worker_links SET failed_attempts = 0, locked = false, locked_at = NULL WHERE id = p_link_id;
  UPDATE public.vouchers SET failed_attempts = 0, is_locked = false WHERE serial = ANY (v_serials);
  RETURN true;
END $function$


-- function unlock_worker_link
CREATE OR REPLACE FUNCTION public.unlock_worker_link(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare sup text;
begin
  if auth.uid() is null then raise exception 'נדרשת התחברות'; end if;
  select to_jsonb(w)->>'supervisor_id' into sup from worker_links w where id = p_id;
  if not found then raise exception 'הלינק לא נמצא'; end if;
  if not has_role(auth.uid(), 'admin') and sup is distinct from auth.uid()::text then
    raise exception 'רק מי שהפיק את השובר או אדמין יכולים לשחרר את הלינק';
  end if;
  update worker_links set failed_attempts = 0, locked = false, locked_at = null where id = p_id;
end $function$


-- function update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$


-- function worker_link_status
CREATE OR REPLACE FUNCTION public.worker_link_status(p_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare l worker_links;
begin
  if p_id !~ '^\d{4,12}$' then return jsonb_build_object('exists', false); end if;
  select * into l from worker_links where id = p_id;
  if not found then return jsonb_build_object('exists', false); end if;
  if _link_expired(l) then return jsonb_build_object('exists', true, 'state', 'expired'); end if;
  if l.locked or coalesce(l.failed_attempts, 0) >= 3 then return jsonb_build_object('exists', true, 'state', 'locked'); end if;
  return jsonb_build_object('exists', true, 'state', 'ok', 'total', l.total,
    'signed', l.worker_id is not null, 'employee_name', coalesce(to_jsonb(l)->>'employee_name', ''));
end $function$


-- index activity_log_created_at_idx
CREATE INDEX activity_log_created_at_idx ON public.activity_log USING btree (created_at DESC)

-- index activity_log_pkey
CREATE UNIQUE INDEX activity_log_pkey ON public.activity_log USING btree (id)

-- index activity_logs_created_at_idx
CREATE INDEX activity_logs_created_at_idx ON public.activity_logs USING btree (created_at DESC)

-- index activity_logs_pkey
CREATE UNIQUE INDEX activity_logs_pkey ON public.activity_logs USING btree (id)

-- index app_settings_pkey
CREATE UNIQUE INDEX app_settings_pkey ON public.app_settings USING btree (key)

-- index app_users_pkey
CREATE UNIQUE INDEX app_users_pkey ON public.app_users USING btree (national_id)

-- index b2b_active_vehicle_lookup
CREATE INDEX b2b_active_vehicle_lookup ON public.b2b_clients USING btree (client_code, standard) WHERE is_active

-- index b2b_clients_active_idx
CREATE INDEX b2b_clients_active_idx ON public.b2b_clients USING btree (branch, client_code) WHERE (is_active = true)

-- index b2b_clients_pkey
CREATE UNIQUE INDEX b2b_clients_pkey ON public.b2b_clients USING btree (id)

-- index b2b_vehicle_identity_key
CREATE UNIQUE INDEX b2b_vehicle_identity_key ON public.b2b_clients USING btree (btrim(standard), btrim(client_code)) WHERE ((NULLIF(btrim(standard), ''::text) IS NOT NULL) AND (NULLIF(btrim(client_code), ''::text) IS NOT NULL))

-- index branches_pkey
CREATE UNIQUE INDEX branches_pkey ON public.branches USING btree (id)

-- index development_tools_owner_pkey
CREATE UNIQUE INDEX development_tools_owner_pkey ON public.development_tools_owner USING btree (singleton)

-- index development_tools_owner_user_id_key
CREATE UNIQUE INDEX development_tools_owner_user_id_key ON public.development_tools_owner USING btree (user_id)

-- index idx_vouchers_fuel_type
CREATE INDEX idx_vouchers_fuel_type ON public.vouchers USING btree (fuel_type)

-- index issue_reasons_pkey
CREATE UNIQUE INDEX issue_reasons_pkey ON public.issue_reasons USING btree (id)

-- index profiles_national_id_key
CREATE UNIQUE INDEX profiles_national_id_key ON public.profiles USING btree (national_id)

-- index profiles_phone_key
CREATE UNIQUE INDEX profiles_phone_key ON public.profiles USING btree (phone)

-- index profiles_pkey
CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id)

-- index regular_active_vehicle_lookup
CREATE INDEX regular_active_vehicle_lookup ON public.regular_clients USING btree (client_id, site_id) WHERE is_active

-- index regular_clients_active_idx
CREATE INDEX regular_clients_active_idx ON public.regular_clients USING btree (client_id, site_id) WHERE (is_active = true)

-- index regular_clients_client_id_site_id_key
CREATE UNIQUE INDEX regular_clients_client_id_site_id_key ON public.regular_clients USING btree (client_id, site_id)

-- index regular_clients_pkey
CREATE UNIQUE INDEX regular_clients_pkey ON public.regular_clients USING btree (id)

-- index regular_clients_sync_key
CREATE UNIQUE INDEX regular_clients_sync_key ON public.regular_clients USING btree (client_id, site_id)

-- index regular_vehicle_identity_key
CREATE UNIQUE INDEX regular_vehicle_identity_key ON public.regular_clients USING btree (btrim(client_id), btrim(site_id)) WHERE ((NULLIF(btrim(client_id), ''::text) IS NOT NULL) AND (NULLIF(btrim(site_id), ''::text) IS NOT NULL))

-- index signatures_archive_pkey
CREATE UNIQUE INDEX signatures_archive_pkey ON public.signatures_archive USING btree (id)

-- index user_roles_pkey
CREATE UNIQUE INDEX user_roles_pkey ON public.user_roles USING btree (id)

-- index user_roles_user_id_role_key
CREATE UNIQUE INDEX user_roles_user_id_role_key ON public.user_roles USING btree (user_id, role)

-- index voucher_codes_card_number_key
CREATE UNIQUE INDEX voucher_codes_card_number_key ON public.voucher_codes USING btree (card_number)

-- index voucher_codes_pkey
CREATE UNIQUE INDEX voucher_codes_pkey ON public.voucher_codes USING btree (serial)

-- index voucher_requests_branch_idx
CREATE INDEX voucher_requests_branch_idx ON public.voucher_requests USING btree (branch)

-- index voucher_requests_pkey
CREATE UNIQUE INDEX voucher_requests_pkey ON public.voucher_requests USING btree (id)

-- index voucher_requests_status_idx
CREATE INDEX voucher_requests_status_idx ON public.voucher_requests USING btree (status)

-- index vouchers_branch_idx
CREATE INDEX vouchers_branch_idx ON public.vouchers USING btree (branch)

-- index vouchers_branch_status_idx
CREATE INDEX vouchers_branch_status_idx ON public.vouchers USING btree (branch, status)

-- index vouchers_card_number_key
CREATE UNIQUE INDEX vouchers_card_number_key ON public.vouchers USING btree (card_number)

-- index vouchers_issuance_lookup_idx
CREATE INDEX vouchers_issuance_lookup_idx ON public.vouchers USING btree (fuel_type, amount) WHERE ((status = ANY (ARRAY['טרם שומש'::text, 'available'::text])) AND (link_id IS NULL))

-- index vouchers_paz_match_key_idx
CREATE INDEX vouchers_paz_match_key_idx ON public.vouchers USING btree (paz_card_match_key(card_number))

-- index vouchers_pkey
CREATE UNIQUE INDEX vouchers_pkey ON public.vouchers USING btree (serial)

-- index vouchers_pool_idx
CREATE INDEX vouchers_pool_idx ON public.vouchers USING btree (branch, fuel_type, amount) WHERE ((status = 'טרם שומש'::text) AND (supervisor IS NULL))

-- index vouchers_redeemed_at_idx
CREATE INDEX vouchers_redeemed_at_idx ON public.vouchers USING btree (redeemed_at) WHERE (redeemed_at IS NOT NULL)

-- index vouchers_status_idx
CREATE INDEX vouchers_status_idx ON public.vouchers USING btree (status)

-- index vouchers_worker_id_idx
CREATE INDEX vouchers_worker_id_idx ON public.vouchers USING btree (worker_id)

-- index worker_links_branch_idx
CREATE INDEX worker_links_branch_idx ON public.worker_links USING btree (branch)

-- index worker_links_pkey
CREATE UNIQUE INDEX worker_links_pkey ON public.worker_links USING btree (id)

-- index worker_links_worker_id_idx
CREATE INDEX worker_links_worker_id_idx ON public.worker_links USING btree (worker_id)

-- policy activity_log.Admins read logs
SELECT | has_role(auth.uid(), 'admin'::app_role) | 

-- policy activity_log.Authenticated insert logs
INSERT |  | ((user_id IS NULL) OR (user_id = auth.uid()))

-- policy activity_log.Import audit admin read
SELECT | has_role(auth.uid(), 'admin'::app_role) | 

-- policy activity_log.Import audit own insert
INSERT |  | (user_id = auth.uid())

-- policy activity_logs.Admins read activity log
SELECT | has_role(auth.uid(), 'admin'::app_role) | 

-- policy activity_logs.Signed-in users add activity
INSERT |  | (auth.uid() IS NOT NULL)

-- policy app_settings.Admin write
ALL | has_role(auth.uid(), 'admin'::app_role) | has_role(auth.uid(), 'admin'::app_role)

-- policy app_settings.Signed-in read
SELECT | true | 

-- policy app_users.Admin write
ALL | has_role(auth.uid(), 'admin'::app_role) | has_role(auth.uid(), 'admin'::app_role)

-- policy app_users.Signed-in read
SELECT | true | 

-- policy b2b_clients.Admin write
ALL | has_role(auth.uid(), 'admin'::app_role) | has_role(auth.uid(), 'admin'::app_role)

-- policy b2b_clients.Signed-in read
SELECT | true | 

-- policy branches.Admin write
ALL | has_role(auth.uid(), 'admin'::app_role) | has_role(auth.uid(), 'admin'::app_role)

-- policy branches.Signed-in read
SELECT | true | 

-- policy issue_reasons.Admin write
ALL | has_role(auth.uid(), 'admin'::app_role) | has_role(auth.uid(), 'admin'::app_role)

-- policy issue_reasons.Signed-in read
SELECT | true | 

-- policy profiles.Users read own profile
SELECT | ((auth.uid() = id) OR has_role(auth.uid(), 'admin'::app_role)) | 

-- policy regular_clients.Admin write
ALL | has_role(auth.uid(), 'admin'::app_role) | has_role(auth.uid(), 'admin'::app_role)

-- policy regular_clients.Signed-in read
SELECT | true | 

-- policy signatures_archive.Admin full access
ALL | has_role(auth.uid(), 'admin'::app_role) | has_role(auth.uid(), 'admin'::app_role)

-- policy signatures_archive.Branch manager reads own branch
SELECT | (has_role(auth.uid(), 'branch'::app_role) AND (branch = my_branch())) | 

-- policy signatures_archive.Staff update own scope
UPDATE | ((branch = my_branch()) OR (supervisor_id = auth.uid())) | ((branch = my_branch()) OR (supervisor_id = auth.uid()))

-- policy signatures_archive.Staff write own scope
INSERT |  | ((branch = my_branch()) OR (supervisor_id = auth.uid()))

-- policy signatures_archive.Supervisor reads own rows
SELECT | (has_role(auth.uid(), 'supervisor'::app_role) AND (supervisor_id = auth.uid())) | 

-- policy user_roles.Users read own roles
SELECT | (auth.uid() = user_id) | 

-- policy voucher_codes.Admins delete voucher codes
DELETE | has_role(auth.uid(), 'admin'::app_role) | 

-- policy voucher_codes.Admins insert voucher codes
INSERT |  | has_role(auth.uid(), 'admin'::app_role)

-- policy voucher_codes.Admins update voucher codes
UPDATE | has_role(auth.uid(), 'admin'::app_role) | has_role(auth.uid(), 'admin'::app_role)

-- policy voucher_codes.Staff read card numbers only
SELECT | (auth.uid() IS NOT NULL) | 

-- policy voucher_requests.Signed-in read
SELECT | true | 

-- policy voucher_requests.Signed-in write
ALL | (auth.uid() IS NOT NULL) | (auth.uid() IS NOT NULL)

-- policy vouchers.Admin full access
ALL | has_role(auth.uid(), 'admin'::app_role) | has_role(auth.uid(), 'admin'::app_role)

-- policy vouchers.Branch manager reads own branch
SELECT | (has_role(auth.uid(), 'branch'::app_role) AND (branch = my_branch())) | 

-- policy vouchers.Staff update own scope
UPDATE | ((branch = my_branch()) OR (supervisor_id = auth.uid())) | ((branch = my_branch()) OR (supervisor_id = auth.uid()))

-- policy vouchers.Staff write own scope
INSERT |  | ((branch = my_branch()) OR (supervisor_id = auth.uid()))

-- policy vouchers.Supervisor reads own rows
SELECT | (has_role(auth.uid(), 'supervisor'::app_role) AND (supervisor_id = auth.uid())) | 

-- policy worker_links.Admin full access
ALL | has_role(auth.uid(), 'admin'::app_role) | has_role(auth.uid(), 'admin'::app_role)

-- policy worker_links.Branch manager reads own branch
SELECT | (has_role(auth.uid(), 'branch'::app_role) AND (branch = my_branch())) | 

-- policy worker_links.Staff update own scope
UPDATE | ((branch = my_branch()) OR (supervisor_id = auth.uid())) | ((branch = my_branch()) OR (supervisor_id = auth.uid()))

-- policy worker_links.Staff write own scope
INSERT |  | ((branch = my_branch()) OR (supervisor_id = auth.uid()))

-- policy worker_links.Supervisor reads own rows
SELECT | (has_role(auth.uid(), 'supervisor'::app_role) AND (supervisor_id = auth.uid())) | 

-- table activity_log
id uuid default gen_random_uuid()
user_id uuid default auth.uid()
user_name text default ''::text
role text default ''::text
action text
target text default '-'::text
ip_address text default '-'::text
created_at timestamp with time zone default now()

-- table activity_logs
id uuid default gen_random_uuid()
created_at timestamp with time zone default now()
user_name text
role text
action text
target text
ip_address text

-- table app_settings
key text
balance integer default 0
updated_at timestamp with time zone default now()

-- table app_users
national_id text
last_name text default ''::text
first_name text default ''::text
role USER-DEFINED default 'supervisor'::app_role
title text default ''::text
phone text default ''::text
branch text default ''::text
can_request boolean default false
requires_password_change boolean default true
created_at timestamp with time zone default now()
updated_at timestamp with time zone default now()

-- table b2b_clients
id uuid default gen_random_uuid()
client_code text
account_name text
client_name text default ''::text
branch text default ''::text
standard text default ''::text
balance text
load_type text
budget_section text
account_key text
item_family text
account_status text
account_type text
created_at timestamp with time zone default now()
updated_at timestamp with time zone default now()
is_active boolean default true

-- table branches
id text
name text
manager text default ''::text
city text default ''::text
created_at timestamp with time zone default now()
updated_at timestamp with time zone default now()

-- table development_tools_owner
singleton boolean default true
user_id uuid

-- table issue_reasons
id uuid default gen_random_uuid()
name text
category text default 'Regular'::text
created_at timestamp with time zone default now()
updated_at timestamp with time zone default now()

-- table profiles
id uuid
phone text
national_id text
full_name text default ''::text
branch text default ''::text
role USER-DEFINED default 'supervisor'::app_role
requires_password_change boolean default true
created_at timestamp with time zone default now()
updated_at timestamp with time zone default now()

-- table regular_clients
id uuid default gen_random_uuid()
client_id text
client_name text default ''::text
site_id text
site_name text default ''::text
standard text
created_at timestamp with time zone default now()
updated_at timestamp with time zone default now()
is_active boolean default true

-- table signatures_archive
id uuid default gen_random_uuid()
created_at timestamp with time zone default now()
link_id text
branch text
supervisor_id uuid
employee_name text
employee_id_number text
employee_phone text
total_amount numeric default 0
voucher_record_ids ARRAY default '{}'::text[]
signature_image_url text

-- table user_roles
id uuid default gen_random_uuid()
user_id uuid
role USER-DEFINED

-- table voucher_codes
serial text
real_code text
created_at timestamp with time zone default now()
redemption_code text
card_number text

-- table voucher_requests
id text
requester text
requester_id text default ''::text
branch text
amount integer
reason text default ''::text
created_on text
status text default 'ממתין לאישור'::text
approved_amount integer
approver text
created_at timestamp with time zone default now()
updated_at timestamp with time zone default now()
benzine_amount integer
diesel_amount integer

-- table vouchers
serial text
real_code text default ''::text
amount integer default 100
branch text default 'מאגר ראשי'::text
supervisor text
client text
status text default 'טרם שומש'::text
updated_on text default to_char(now(), 'YYYY-MM-DD'::text)
requester text
approver text
client_id text
site_id text
site_name text
reason text
worker_name text
worker_id text
delivered_at text
route text
link_id text
client_code text
account_name text
standard text
license_plate text
driver_name text
standard_name text
created_at timestamp with time zone default now()
updated_at timestamp with time zone default now()
employee_name text
employee_id text
employee_phone text
issue_reason text
issued_at timestamp with time zone
expires_at timestamp with time zone
supervisor_id uuid
card_number text
failed_attempts integer default 0
is_locked boolean default false
fuel_type character varying default 'בנזין'::character varying
redeemed_at timestamp with time zone

-- table worker_links
id text
total integer
serials ARRAY default '{}'::text[]
created_on text
worker_id text
phone text
signed_at text
created_at timestamp with time zone default now()
updated_at timestamp with time zone default now()
employee_name text
branch text
supervisor_id uuid
failed_attempts integer default 0
locked boolean default false
locked_at timestamp with time zone

-- trigger require_active_issuance_client
CREATE TRIGGER require_active_issuance_client BEFORE INSERT OR UPDATE OF link_id ON public.vouchers FOR EACH ROW EXECUTE FUNCTION require_active_issuance_client()

-- trigger require_active_private_vehicle
CREATE TRIGGER require_active_private_vehicle BEFORE INSERT OR UPDATE OF link_id ON public.vouchers FOR EACH ROW EXECUTE FUNCTION require_active_private_vehicle()

-- trigger trg_app_settings_updated
CREATE TRIGGER trg_app_settings_updated BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()

-- trigger trg_app_users_updated
CREATE TRIGGER trg_app_users_updated BEFORE UPDATE ON public.app_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()

-- trigger trg_b2b_clients_updated
CREATE TRIGGER trg_b2b_clients_updated BEFORE UPDATE ON public.b2b_clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()

-- trigger trg_branches_updated
CREATE TRIGGER trg_branches_updated BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()

-- trigger trg_issue_reasons_updated
CREATE TRIGGER trg_issue_reasons_updated BEFORE UPDATE ON public.issue_reasons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()

-- trigger trg_regular_clients_updated
CREATE TRIGGER trg_regular_clients_updated BEFORE UPDATE ON public.regular_clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()

-- trigger trg_voucher_codes_sync
CREATE TRIGGER trg_voucher_codes_sync BEFORE INSERT OR UPDATE ON public.voucher_codes FOR EACH ROW EXECUTE FUNCTION sync_redemption_code()

-- trigger trg_voucher_requests_updated
CREATE TRIGGER trg_voucher_requests_updated BEFORE UPDATE ON public.voucher_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()

-- trigger trg_vouchers_updated
CREATE TRIGGER trg_vouchers_updated BEFORE UPDATE ON public.vouchers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()

-- trigger trg_worker_links_updated
CREATE TRIGGER trg_worker_links_updated BEFORE UPDATE ON public.worker_links FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()

