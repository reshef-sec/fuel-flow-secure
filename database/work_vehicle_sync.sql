-- Install in the external application database before the updated work-vehicle import.
-- Preserves all client rows and voucher history. No data deletion or RLS relaxation.
BEGIN;
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
-- Prerequisite: prior import_integrity.sql supplies log_import_action and regular-client is_active.
-- Read-only checks:
-- SELECT standard,client_code,account_name,is_active FROM public.b2b_clients WHERE standard='80620031';