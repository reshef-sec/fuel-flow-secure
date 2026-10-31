-- Install in the EXTERNAL application database before deploying the matching frontend.
-- No deletion, no historical status rewrite, no demo data. Back up first.
-- Existing duplicate/mismatched keys abort this transaction instead of deleting records.
BEGIN;
ALTER TABLE public.regular_clients ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.b2b_clients ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS regular_clients_sync_key ON public.regular_clients(client_id, site_id);
CREATE UNIQUE INDEX IF NOT EXISTS b2b_clients_sync_key ON public.b2b_clients(client_code, account_name);
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
END $$;
REVOKE ALL ON FUNCTION public.sync_vehicle_pool(text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_vehicle_pool(text,jsonb) TO authenticated;

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

CREATE OR REPLACE FUNCTION public.reconcile_redeemed_vouchers(card_numbers text[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ DECLARE n integer; BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
  IF card_numbers IS NULL OR cardinality(card_numbers)=0 THEN RAISE EXCEPTION 'Card numbers required'; END IF;
  UPDATE public.vouchers SET status='redeemed',redeemed_at=now(),updated_on=to_char(now() AT TIME ZONE 'Asia/Jerusalem','YYYY-MM-DD')
    WHERE card_number IN (SELECT trim(x) FROM unnest(card_numbers) x)
      AND (status IS DISTINCT FROM 'redeemed' OR redeemed_at IS NULL);
  GET DIAGNOSTICS n=ROW_COUNT;
  PERFORM public.log_import_action('היזון חוזר מימושים מפז',n || ' שוברים עודכנו למומש בפועל');
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.reconcile_redeemed_vouchers(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_redeemed_vouchers(text[]) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Read-only checks (no confidential codes):
-- SELECT client_id,site_id,is_active FROM public.regular_clients;
-- SELECT client_code,account_name,is_active FROM public.b2b_clients;
-- SELECT card_number,count(*) FROM public.vouchers GROUP BY card_number HAVING count(*)>1;
-- SELECT card_number,status,redeemed_at FROM public.vouchers WHERE status='redeemed';
-- SELECT action,target,created_at FROM public.activity_log ORDER BY created_at DESC LIMIT 20;
-- Existing historical statuses remain untouched until present in Paz feedback.