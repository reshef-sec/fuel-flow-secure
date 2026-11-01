-- Disposable PostgreSQL only. Never run this fixture in the application database.
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TYPE public.app_role AS ENUM ('admin', 'branch', 'supervisor');
CREATE TABLE public.user_roles(user_id uuid, role app_role);
CREATE FUNCTION public.has_role(id uuid, r app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=id AND role=r) $$;
CREATE TABLE public.profiles(id uuid, national_id text, branch text);
CREATE TABLE public.app_users(national_id text, last_name text, first_name text);
-- Numeric + varchar deliberately reproduce the prior rigid return-type mismatch.
CREATE TABLE public.vouchers(serial varchar PRIMARY KEY, card_number text GENERATED ALWAYS AS (serial) STORED,
  amount numeric NOT NULL, fuel_type varchar, branch text, supervisor text, supervisor_id uuid, status text,
  link_id text, worker_id text, worker_name text, employee_name text, client text, client_id text, client_code text,
  account_name text, standard text, site_id text, site_name text, reason text, issue_reason text, route text,
  requester text, updated_on text, delivered_at text, issued_at timestamptz, expires_at timestamptz,
  real_code text DEFAULT 'CONFIDENTIAL-TEST-ONLY');
CREATE TABLE public.worker_links(id text PRIMARY KEY, total integer, serials text[], created_on text, employee_name text, branch text, supervisor_id uuid);
-- Simulate replacement of the existing table-returning function.
CREATE FUNCTION public.issue_voucher_to_worker(jsonb,text,text,jsonb) RETURNS TABLE(serial text,amount integer,fuel_type text,item_index integer) LANGUAGE sql AS $$ SELECT NULL::text,0,NULL::text,0 $$;
\ir issue_voucher_to_worker.sql
-- Repeat installation verifies drop/replace and grant idempotency.
\ir issue_voucher_to_worker.sql
BEGIN;
INSERT INTO public.user_roles VALUES ('10000000-0000-0000-0000-000000000001','branch');
INSERT INTO public.profiles VALUES ('10000000-0000-0000-0000-000000000001','test','צפון');
INSERT INTO public.app_users VALUES ('test','Test','Manager');
INSERT INTO public.vouchers(serial,amount,fuel_type,branch,status) VALUES
 ('0001',100,'בנזין 95','סניף צפון','available'),('0002',50,'סולר','צפון','available'),
 ('0003',100,'בנזין','צפון','available'),('0004',100,'בנזין','דרום','available');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
DO $$ DECLARE r jsonb; denied boolean := false; BEGIN
 r := public.issue_voucher_to_worker('[{"amount":100,"fuel_type":"בנזין 95"},{"amount":50,"fuel_type":"סולר"}]','צפון',NULL,'{"id":"123456","employee_name":"Test Employee"}');
 IF r->>'link_id'<>'123456' OR (r->>'total')::integer<>150 OR jsonb_array_length(r->'vouchers')<>2 THEN RAISE EXCEPTION 'Wrong JSONB envelope'; END IF;
 IF r->'vouchers'->0->>'serial'<>'0001' OR r->'vouchers'->1->>'serial'<>'0002' THEN RAISE EXCEPTION 'Wrong physical selection'; END IF;
 IF r::text LIKE '%CONFIDENTIAL%' OR r::text LIKE '%real_code%' THEN RAISE EXCEPTION 'Code exposed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.worker_links WHERE id='123456' AND total=150 AND cardinality(serials)=2) THEN RAISE EXCEPTION 'Link not persisted'; END IF;
 IF (SELECT count(*) FROM public.vouchers WHERE status='issued' AND link_id='123456')<>2 THEN RAISE EXCEPTION 'Not issued'; END IF;
 -- Failed link insertion must roll back the voucher mutation.
 BEGIN PERFORM public.issue_voucher_to_worker('[{"amount":100,"fuel_type":"בנזין"}]','צפון',NULL,'{"id":"123456","employee_name":"Test Employee"}');
 EXCEPTION WHEN unique_violation THEN denied := true; END;
 IF NOT denied OR NOT EXISTS(SELECT 1 FROM public.vouchers WHERE serial='0003' AND status='available' AND link_id IS NULL) THEN RAISE EXCEPTION 'Atomic rollback failed'; END IF;
 -- A shortage in item 2 must undo item 1 too.
 denied := false;
 BEGIN PERFORM public.issue_voucher_to_worker('[{"amount":100,"fuel_type":"בנזין"},{"amount":50,"fuel_type":"סולר"}]','צפון',NULL,'{"id":"123457","employee_name":"Test Employee"}');
 EXCEPTION WHEN raise_exception THEN denied := true; END;
 IF NOT denied OR EXISTS(SELECT 1 FROM public.worker_links WHERE id='123457') OR NOT EXISTS(SELECT 1 FROM public.vouchers WHERE serial='0003' AND status='available') THEN RAISE EXCEPTION 'Partial issue persisted'; END IF;
 denied := false;
 BEGIN PERFORM public.issue_voucher_to_worker('[{"amount":100,"fuel_type":"בנזין"}]','דרום',NULL,'{"id":"123458","employee_name":"Test Employee"}');
 EXCEPTION WHEN raise_exception THEN denied := true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Foreign branch permitted'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 denied := false;
 BEGIN PERFORM public.issue_voucher_to_worker('[{"amount":100,"fuel_type":"בנזין"}]','צפון',NULL,'{"id":"123459","employee_name":"Test Employee"}');
 EXCEPTION WHEN raise_exception THEN denied := true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Anonymous issue permitted'; END IF;
 IF NOT has_function_privilege('anon','public.issue_voucher_to_worker(jsonb,text,text,jsonb)','execute') THEN RAISE EXCEPTION 'Missing requested anon execute grant'; END IF;
END $$;
ROLLBACK;