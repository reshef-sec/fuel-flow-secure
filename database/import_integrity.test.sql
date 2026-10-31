-- Regression tests. Run ONLY in a disposable database after schema + import_integrity.sql.
-- Entire test rolls back. No real users or live inventory may be present.
BEGIN;
INSERT INTO public.profiles(id,phone,national_id,full_name) VALUES('10000000-0000-0000-0000-000000000001','test-admin','test-admin','Test Admin');
INSERT INTO public.user_roles(user_id,role) VALUES('10000000-0000-0000-0000-000000000001','admin');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
DO $$ DECLARE r jsonb; n integer; stamp timestamptz; denied boolean:=false; BEGIN
  PERFORM public.sync_vehicle_pool('regular','[{"client_id":"C1","site_id":"S1","client_name":"Old"},{"client_id":"C2","site_id":"S2","client_name":"Historical"}]');
  r:=public.sync_vehicle_pool('regular','[{"client_id":"C1","site_id":"S1","client_name":"Updated"}]');
  IF r->>'deactivated'<>'1' OR (SELECT count(*) FROM public.regular_clients)<>2 THEN RAISE EXCEPTION 'Delta sync deleted history or wrong deactivation'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.regular_clients WHERE client_id='C1' AND client_name='Updated' AND is_active) THEN RAISE EXCEPTION 'Existing payload not updated'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.regular_clients WHERE client_id='C2' AND NOT is_active) THEN RAISE EXCEPTION 'Missing record still active'; END IF;
  PERFORM public.sync_vehicle_pool('regular','[{"client_id":"C2","site_id":"S2","client_name":"Reactivated"}]');
  IF NOT EXISTS(SELECT 1 FROM public.regular_clients WHERE client_id='C2' AND is_active AND client_name='Reactivated') THEN RAISE EXCEPTION 'Reactivation failed'; END IF;
  PERFORM public.sync_vehicle_pool('b2b','[{"client_code":"B1","account_name":"A1","client_name":"Old"},{"client_code":"B2","account_name":"A2"}]');
  PERFORM public.sync_vehicle_pool('b2b','[{"client_code":"B1","account_name":"A1","client_name":"Updated"}]');
  IF (SELECT count(*) FROM public.b2b_clients)<>2 OR NOT EXISTS(SELECT 1 FROM public.b2b_clients WHERE client_code='B2' AND NOT is_active) OR NOT EXISTS(SELECT 1 FROM public.b2b_clients WHERE client_code='B1' AND client_name='Updated') THEN RAISE EXCEPTION 'B2B delta failed'; END IF;
  r:=public.import_voucher_inventory('[{"serial":"0001","real_code":"TEST-ONLY","amount":100,"fuel_type":"בנזין"},{"serial":"0001","real_code":"DIFFERENT","amount":500,"fuel_type":"סולר"},{"serial":"0002","real_code":"TEST-ONLY","amount":50,"fuel_type":"סולר"}]');
  IF r->>'added'<>'2' OR r->>'skipped'<>'1' THEN RAISE EXCEPTION 'Duplicate count failed'; END IF;
  r:=public.import_voucher_inventory('[{"serial":"0001","real_code":"OVERWRITE","amount":500,"fuel_type":"סולר"}]');
  IF r->>'added'<>'0' OR r->>'skipped'<>'1' OR (SELECT amount FROM public.vouchers WHERE card_number='0001')<>100 OR (SELECT real_code FROM public.voucher_codes WHERE card_number='0001')<>'TEST-ONLY' THEN RAISE EXCEPTION 'Historical stock/code overwritten'; END IF;
  n:=public.reconcile_redeemed_vouchers(ARRAY['0001','0001','missing']);
  SELECT redeemed_at INTO stamp FROM public.vouchers WHERE card_number='0001';
  IF n<>1 OR stamp IS NULL OR NOT EXISTS(SELECT 1 FROM public.vouchers WHERE card_number='0001' AND status='redeemed') THEN RAISE EXCEPTION 'Paz timestamp/status failed'; END IF;
  n:=public.reconcile_redeemed_vouchers(ARRAY['0001']);
  IF n<>0 OR (SELECT redeemed_at FROM public.vouchers WHERE card_number='0001') IS DISTINCT FROM stamp THEN RAISE EXCEPTION 'Repeated feedback changed original timestamp'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.activity_log WHERE action='היזון חוזר מימושים מפז') THEN RAISE EXCEPTION 'Missing Paz audit'; END IF;
  BEGIN
    UPDATE public.vouchers SET route='regular',client_id='C1',site_id='S1',link_id='test-link' WHERE serial='0002';
  EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Inactive client issuance accepted'; END IF;
  UPDATE public.vouchers SET route='regular',client_id='C2',site_id='S2',link_id='test-link' WHERE serial='0002';
  PERFORM public.sync_vehicle_pool('regular','[{"client_id":"C1","site_id":"S1"}]');
  PERFORM public.reconcile_redeemed_vouchers(ARRAY['0002']);
  IF NOT EXISTS(SELECT 1 FROM public.vouchers v JOIN public.regular_clients c ON c.client_id=v.client_id AND c.site_id=v.site_id WHERE v.serial='0002' AND NOT c.is_active AND v.status='redeemed') THEN RAISE EXCEPTION 'Inactive historical client no longer resolves'; END IF;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
  denied:=false;
  BEGIN PERFORM public.reconcile_redeemed_vouchers(ARRAY['0001']); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Non-admin reconciliation permitted'; END IF;
END $$;
ROLLBACK;