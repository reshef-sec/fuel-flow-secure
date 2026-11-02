-- Install in the external application database. Safe to reinstall.
-- Prerequisite: prior import_integrity.sql (log_import_action, protected admin role).
-- No deletion, no history rewrite and no anonymous access or RLS weakening.
BEGIN;
ALTER TABLE public.regular_clients ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.regular_clients TO authenticated;
GRANT ALL ON public.regular_clients TO service_role;
ALTER TABLE public.regular_clients ENABLE ROW LEVEL SECURITY;
-- Existing admin policies remain in force.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.regular_clients WHERE nullif(btrim(client_id),'') IS NOT NULL AND nullif(btrim(site_id),'') IS NOT NULL
    GROUP BY btrim(client_id),btrim(site_id) HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Existing duplicate client/site keys require review; no records were changed';
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS regular_vehicle_identity_key ON public.regular_clients(btrim(client_id),btrim(site_id))
  WHERE nullif(btrim(client_id),'') IS NOT NULL AND nullif(btrim(site_id),'') IS NOT NULL;
CREATE INDEX IF NOT EXISTS regular_active_vehicle_lookup ON public.regular_clients(client_id,site_id) WHERE is_active;

CREATE OR REPLACE FUNCTION public.sync_private_vehicles(p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.sync_private_vehicles(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sync_private_vehicles(jsonb) TO authenticated;

-- A separate trigger preserves the work-vehicle trigger and blocks stale or
-- direct requests attempting a NEW private-vehicle assignment to an inactive row.
CREATE OR REPLACE FUNCTION public.require_active_private_vehicle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
  IF NEW.route IS DISTINCT FROM 'regular' OR nullif(NEW.link_id,'') IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN IF OLD.link_id IS NOT DISTINCT FROM NEW.link_id THEN RETURN NEW; END IF; END IF;
  PERFORM 1 FROM public.regular_clients WHERE btrim(client_id)=btrim(NEW.client_id) AND btrim(site_id)=btrim(NEW.site_id) AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'הרכב הפרטי או האתר אינם פעילים'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.require_active_private_vehicle() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS require_active_private_vehicle ON public.vouchers;
CREATE TRIGGER require_active_private_vehicle BEFORE INSERT OR UPDATE OF link_id ON public.vouchers FOR EACH ROW EXECUTE FUNCTION public.require_active_private_vehicle();
NOTIFY pgrst,'reload schema';
COMMIT;
-- Read-only check: SELECT client_id,site_id,client_name,site_name,is_active FROM public.regular_clients;