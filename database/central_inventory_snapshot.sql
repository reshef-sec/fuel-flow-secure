-- Install in the external application database. Keeps the existing summary signature.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_central_inventory_snapshot()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.get_central_inventory_snapshot() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_central_inventory_snapshot() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_central_inventory_summary()
RETURNS TABLE(total_available_amount numeric,gasoline_amount numeric,diesel_amount numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
  SELECT (r->>'total_available_amount')::numeric,(r->>'gasoline_amount')::numeric,(r->>'diesel_amount')::numeric
  FROM (SELECT public.get_central_inventory_snapshot() r) snapshot;
$$;
REVOKE ALL ON FUNCTION public.get_central_inventory_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_central_inventory_summary() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;