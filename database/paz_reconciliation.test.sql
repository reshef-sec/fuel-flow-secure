-- Disposable database only; run after paz_reconciliation.sql. All rows roll back.
BEGIN;
INSERT INTO public.profiles(id,full_name) VALUES('10000000-0000-0000-0000-000000000001','Test Admin');
INSERT INTO public.user_roles(user_id,role) VALUES('10000000-0000-0000-0000-000000000001','admin');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
INSERT INTO public.vouchers(serial,status) VALUES
 ('019950','issued'), ('019951','available'), ('019952','הוקצה לעובד'),
 ('019953','טרם שומש'), ('019954','חסום'), ('019955','מומש בפועל');
DO $$ DECLARE n integer; stamp timestamptz; denied boolean:=false; BEGIN
  IF public.paz_card_match_key(' 019950 ')<>'19950'
    OR public.paz_card_match_key('19950.0')<>'19950'
    OR public.paz_card_match_key('00012345678901234567890')<>'12345678901234567890' THEN
    RAISE EXCEPTION 'Normalization failed';
  END IF;
  n:=public.reconcile_redeemed_vouchers(ARRAY[' 19950 ', '019950', '19951.0', '19952', '019953', '019954', '019955', 'missing']);
  IF n<>5 THEN RAISE EXCEPTION 'Expected 5 eligible updates, got %',n; END IF;
  IF (SELECT count(*) FROM public.vouchers WHERE status='redeemed' AND redeemed_at=now())<>5 THEN RAISE EXCEPTION 'Final redemption status/timestamp failed'; END IF;
  IF (SELECT status FROM public.vouchers WHERE serial='019954')<>'חסום' THEN RAISE EXCEPTION 'Blocked card updated'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.activity_log WHERE action='היזון חוזר מימושים מפז' AND target='5 שוברים עודכנו למומש סופית · מספרי כרטיסים: 019950, 019951, 019952, 019953, 019955') THEN RAISE EXCEPTION 'Audit count or original numbers missing'; END IF;
  SELECT redeemed_at INTO stamp FROM public.vouchers WHERE serial='019950';
  n:=public.reconcile_redeemed_vouchers(ARRAY['19950','019951']);
  IF n<>0 OR (SELECT redeemed_at FROM public.vouchers WHERE serial='019950') IS DISTINCT FROM stamp THEN RAISE EXCEPTION 'Repeat import not idempotent'; END IF;
  INSERT INTO public.vouchers(serial,status) VALUES('19950','available');
  BEGIN PERFORM public.reconcile_redeemed_vouchers(ARRAY['19950','19954']); EXCEPTION WHEN raise_exception THEN denied:=true; END;
  IF NOT denied OR (SELECT status FROM public.vouchers WHERE serial='19950')<>'available' THEN RAISE EXCEPTION 'Ambiguous cards accepted'; END IF;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
  denied:=false;
  BEGIN PERFORM public.reconcile_redeemed_vouchers(ARRAY['019951']); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Non-admin reconciliation accepted'; END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);
  denied:=false;
  BEGIN PERFORM public.reconcile_redeemed_vouchers(ARRAY['019951']); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied OR has_function_privilege('anon','public.reconcile_redeemed_vouchers(text[])','EXECUTE') THEN RAISE EXCEPTION 'Anonymous reconciliation allowed'; END IF;
END $$;
ROLLBACK;