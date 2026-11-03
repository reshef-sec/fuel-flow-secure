-- Install in the EXTERNAL application database before deploying the matching frontend.
-- No deletion, no historical status rewrite, no demo data. Back up first.
-- Existing duplicate/mismatched keys abort this transaction instead of deleting records.
BEGIN;
ALTER TABLE public.regular_clients ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.b2b_clients ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS regular_clients_sync_key ON public.regular_clients(client_id, site_id);
-- Work-vehicle identity is installed below by the dedicated standard/client sync.
CREATE INDEX IF NOT EXISTS regular_clients_active_idx ON public.regular_clients(client_id, site_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS b2b_clients_active_idx ON public.b2b_clients(branch, client_code) WHERE is_active = true;

ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS card_number text GENERATED ALWAYS AS (serial) STORED;
ALTER TABLE public.voucher_codes ADD COLUMN IF NOT EXISTS card_number text GENERATED ALWAYS AS (serial) STORED;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS redeemed_at timestamptz;
-- Some earlier installations used a plain alias instead of a generated column.
-- Fail on inconsistent aliases; do not silently relabel historical cards.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.vouchers WHERE card_number IS DISTINCT FROM serial)
    OR EXISTS (SELECT 1 FROM public.voucher_codes WHERE card_number IS DISTINCT FROM serial) THEN
    RAISE EXCEPTION 'card_number and serial differ. Review historical rows before installing.';
  END IF;
END $$;
ALTER TABLE public.vouchers ALTER COLUMN card_number SET NOT NULL;
ALTER TABLE public.voucher_codes ALTER COLUMN card_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vouchers_card_number_key ON public.vouchers(card_number);
CREATE UNIQUE INDEX IF NOT EXISTS voucher_codes_card_number_key ON public.voucher_codes(card_number);
-- Immutable per-row alias consistency also protects legacy insert paths.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.vouchers'::regclass AND conname = 'vouchers_card_alias_check') THEN
    ALTER TABLE public.vouchers ADD CONSTRAINT vouchers_card_alias_check CHECK (card_number = serial);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.voucher_codes'::regclass AND conname = 'voucher_codes_card_alias_check') THEN
    ALTER TABLE public.voucher_codes ADD CONSTRAINT voucher_codes_card_alias_check CHECK (card_number = serial);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS vouchers_redeemed_at_idx ON public.vouchers(redeemed_at) WHERE redeemed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
  user_name text NOT NULL DEFAULT '', role text NOT NULL DEFAULT '',
  action text NOT NULL, target text NOT NULL DEFAULT '-',
  ip_address text NOT NULL DEFAULT '-', created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='activity_log' AND policyname='Import audit admin read') THEN
    CREATE POLICY "Import audit admin read" ON public.activity_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='activity_log' AND policyname='Import audit own insert') THEN
    CREATE POLICY "Import audit own insert" ON public.activity_log FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.log_import_action(p_action text, p_target text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.activity_log(user_id,user_name,role,action,target)
    VALUES(auth.uid(),coalesce((SELECT full_name FROM public.profiles WHERE id=auth.uid()),''),'אדמין מרכזי',p_action,p_target);
END $$;
REVOKE ALL ON FUNCTION public.log_import_action(text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_vehicle_pool(p_pool text, p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
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
    RETURN public.sync_work_vehicles(p_rows);
  ELSE RAISE EXCEPTION 'Unknown vehicle pool'; END IF;
  PERFORM public.log_import_action('סנכרון מאגר רכב',p_pool || ': ' || added || ' חדשים, ' || updated || ' עודכנו, ' || deactivated || ' לא פעילים');
  RETURN jsonb_build_object('added',added,'updated',updated,'deactivated',deactivated);
END $$;
REVOKE ALL ON FUNCTION public.sync_vehicle_pool(text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_vehicle_pool(text,jsonb) TO authenticated;

-- Enforce active clients even when a stale browser or direct RPC attempts issuance.
-- Only the initial employee assignment is checked; historical rows may later be redeemed.
CREATE OR REPLACE FUNCTION public.require_active_issuance_client()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ BEGIN
  IF nullif(NEW.link_id,'') IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.link_id IS NOT DISTINCT FROM NEW.link_id THEN RETURN NEW; END IF;
  END IF;
  IF NEW.route='regular' THEN
    PERFORM 1 FROM public.regular_clients WHERE client_id=NEW.client_id AND site_id=NEW.site_id AND is_active=true FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'הלקוח או האתר אינם פעילים'; END IF;
  ELSIF NEW.route='b2b' THEN
    PERFORM 1 FROM public.b2b_clients WHERE client_code=NEW.client_code AND account_name=NEW.account_name AND is_active=true FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'לקוח רכב העבודה אינו פעיל'; END IF;
  ELSE RAISE EXCEPTION 'יש לבחור מאגר לקוחות להנפקה'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.require_active_issuance_client() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS require_active_issuance_client ON public.vouchers;
CREATE TRIGGER require_active_issuance_client BEFORE INSERT OR UPDATE OF link_id ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.require_active_issuance_client();

CREATE OR REPLACE FUNCTION public.import_voucher_inventory(p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.import_voucher_inventory(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_voucher_inventory(jsonb) TO authenticated;
-- No confidential code SELECT grant is introduced. Stock + code inserts + audit are one transaction.

-- Canonical matching key only: retain the original stored number for audit/history.
-- Text 019950, numeric Excel 19950 and 19950.0 share a key; nonnumeric IDs
-- remain intact. Never cast to integer (long card numbers must stay exact).
CREATE OR REPLACE FUNCTION public.paz_card_match_key(p_card text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog
AS $$
  WITH cleaned AS (
    SELECT regexp_replace(translate(p_card, chr(160) || chr(65279), ''), '[[:space:]]', '', 'g') AS value
  ), numeric_text AS (
    SELECT CASE WHEN value ~ '^[0-9]+[.]0+$' THEN split_part(value, '.', 1) ELSE value END AS value FROM cleaned
  )
  SELECT CASE WHEN value ~ '^[0-9]+$' THEN coalesce(nullif(ltrim(value, '0'), ''), '0') ELSE value END FROM numeric_text
$$;
REVOKE ALL ON FUNCTION public.paz_card_match_key(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.paz_card_match_key(text) TO authenticated, service_role;
CREATE INDEX IF NOT EXISTS vouchers_paz_match_key_idx ON public.vouchers(public.paz_card_match_key(card_number));

CREATE OR REPLACE FUNCTION public.reconcile_redeemed_vouchers(card_numbers text[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.reconcile_redeemed_vouchers(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_redeemed_vouchers(text[]) TO authenticated;
ALTER TABLE public.b2b_clients ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_clients TO authenticated;
GRANT ALL ON public.b2b_clients TO service_role;
ALTER TABLE public.b2b_clients ENABLE ROW LEVEL SECURITY;
-- Existing admin policies remain in force; this script grants no anonymous access.

-- Fail safely on pre-existing duplicate physical identities; never delete history.
DO $$ DECLARE item record; BEGIN
  IF EXISTS (SELECT 1 FROM public.b2b_clients WHERE nullif(btrim(standard),'') IS NOT NULL AND nullif(btrim(client_code),'') IS NOT NULL
    GROUP BY btrim(standard),btrim(client_code) HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Existing duplicate standard/client keys require review; no records were changed';
  END IF;
  -- Retire only the obsolete two-column account identity, whether installed as
  -- a UNIQUE constraint or an independent unique index. Do not CASCADE.
  FOR item IN SELECT c.conname FROM pg_constraint c WHERE c.conrelid='public.b2b_clients'::regclass AND c.contype='u'
    AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM unnest(c.conkey) k JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k)=ARRAY['account_name','client_code']::text[] LOOP
    EXECUTE format('ALTER TABLE public.b2b_clients DROP CONSTRAINT %I',item.conname);
  END LOOP;
  FOR item IN SELECT i.indexrelid::regclass AS index_name FROM pg_index i WHERE i.indrelid='public.b2b_clients'::regclass AND i.indisunique AND NOT i.indisprimary
    AND i.indexprs IS NULL AND i.indnkeyatts=2
    AND NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conindid=i.indexrelid)
    AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM unnest(i.indkey::smallint[]) k JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k)=ARRAY['account_name','client_code']::text[] LOOP
    EXECUTE format('DROP INDEX %s',item.index_name);
  END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS b2b_vehicle_identity_key ON public.b2b_clients(btrim(standard), btrim(client_code))
  WHERE nullif(btrim(standard),'') IS NOT NULL AND nullif(btrim(client_code),'') IS NOT NULL;
CREATE INDEX IF NOT EXISTS b2b_active_vehicle_lookup ON public.b2b_clients(client_code,standard) WHERE is_active;

CREATE OR REPLACE FUNCTION public.sync_work_vehicles(p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public
AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.sync_work_vehicles(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sync_work_vehicles(jsonb) TO authenticated;

-- Physical vehicle identity, not a shared account name, controls new issuance.
CREATE OR REPLACE FUNCTION public.require_active_issuance_client()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
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
END $$;
REVOKE ALL ON FUNCTION public.require_active_issuance_client() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS require_active_issuance_client ON public.vouchers;
CREATE TRIGGER require_active_issuance_client BEFORE INSERT OR UPDATE OF link_id ON public.vouchers FOR EACH ROW EXECUTE FUNCTION public.require_active_issuance_client();

NOTIFY pgrst,'reload schema';
COMMIT;

-- Read-only checks (no confidential codes):
-- SELECT client_id,site_id,is_active FROM public.regular_clients;
-- SELECT client_code,account_name,is_active FROM public.b2b_clients;
-- SELECT card_number,count(*) FROM public.vouchers GROUP BY card_number HAVING count(*)>1;
-- SELECT card_number,status,redeemed_at FROM public.vouchers WHERE status='redeemed';
-- SELECT action,target,created_at FROM public.activity_log ORDER BY created_at DESC LIMIT 20;
-- Existing historical statuses remain untouched until present in Paz feedback.