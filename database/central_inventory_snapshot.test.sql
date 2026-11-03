-- Disposable database only. Requires central_inventory_snapshot.sql, auth.uid and has_role fixtures.
BEGIN;
INSERT INTO public.profiles(id,full_name) VALUES('10000000-0000-0000-0000-000000000001','Test Admin');
INSERT INTO public.user_roles(user_id,role) VALUES('10000000-0000-0000-0000-000000000001','admin');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
INSERT INTO public.vouchers(serial,amount,fuel_type,status,branch,branch_id)
SELECT fuel||amount,amount,fuel,'available','מאגר מרכזי','10000000-0000-0000-0000-000000000003'::uuid
FROM unnest(ARRAY['בנזין 95','סולר']) fuel CROSS JOIN unnest(ARRAY[50,100,150,200,300,700]) amount;
INSERT INTO public.vouchers(serial,amount,fuel_type,status,branch,branch_id,supervisor,link_id) VALUES
 ('issued',800,'בנזין','issued','מאגר מרכזי',NULL,NULL,NULL),
 ('redeemed',800,'בנזין','redeemed','מאגר מרכזי',NULL,NULL,NULL),
 ('allocated',800,'בנזין','allocated','מאגר מרכזי',NULL,NULL,NULL),
 ('supervisor',800,'בנזין','available','מאגר מרכזי',NULL,'Test',NULL),
 ('linked',800,'בנזין','available','מאגר מרכזי',NULL,NULL,'link'),
 ('branch',800,'בנזין','available','צפון','10000000-0000-0000-0000-000000000003',NULL,NULL);
DO $$ DECLARE r jsonb; t numeric; denied boolean:=false; BEGIN
  r:=public.get_central_inventory_snapshot();
  IF r->>'total_available_amount'<>'3000' OR r->>'gasoline_amount'<>'1500' OR r->>'diesel_amount'<>'1500' THEN RAISE EXCEPTION 'Inventory filter mismatch'; END IF;
  IF jsonb_array_length(r->'denominations')<>12 THEN RAISE EXCEPTION 'Hidden denomination'; END IF;
  SELECT sum((x->>'amount')::numeric*(x->>'count')::numeric) INTO t FROM jsonb_array_elements(r->'denominations') x;
  IF t<>3000 THEN RAISE EXCEPTION 'Breakdown mismatch'; END IF;
  SELECT total_available_amount INTO t FROM public.get_central_inventory_summary();
  IF t<>3000 THEN RAISE EXCEPTION 'Legacy wrapper mismatch'; END IF;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
  BEGIN PERFORM public.get_central_inventory_snapshot(); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied OR has_function_privilege('anon','public.get_central_inventory_snapshot()','EXECUTE') THEN RAISE EXCEPTION 'Unauthorized inventory access'; END IF;
END $$;
ROLLBACK;